/** Aviso externo, pelo próprio WhatsApp da organização, para handoff sem dono. */
import type pg from "pg";

import { createPool } from "@/lib/agent-engine/db/pool";
import { decidePacing } from "@/lib/agent-engine/pacing/engine";
import { loadChannelKnobs, loadPacingState, recordSend } from "@/lib/agent-engine/pacing/store";
import { getAdapter, resolveSessionRef, type ChannelSessionRef } from "@/lib/channels";
import { quemPodeAssumirAgora } from "@/lib/escalacao/disponibilidade";
import type { EventRow, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";

export const HANDOFF_OWNER_ALERT_CONSUMER = "handoff_owner_alert_v1";
let _pool: pg.Pool | null = null;
function pool(): pg.Pool {
  _pool ??= createPool(process.env.SUPABASE_DB_URL ?? "");
  return _pool;
}

export function mascararTelefoneParaAviso(valor: string | null): string {
  const digitos = (valor ?? "").replace(/\D/g, "");
  if (digitos.length < 4) return "contato sem número visível";
  const fim = digitos.slice(-4);
  const inicio = digitos.slice(0, Math.min(4, Math.max(0, digitos.length - 4)));
  return `+${inicio} *****-${fim}`;
}

function config(settings: unknown): { phone: string | null; reminder: number } {
  const root = settings && typeof settings === "object" ? (settings as Record<string, unknown>) : {};
  const routing = root.routing && typeof root.routing === "object" ? (root.routing as Record<string, unknown>) : {};
  const phone = typeof routing.owner_phone === "string" ? routing.owner_phone.replace(/\D/g, "") : "";
  const reminder = Number(routing.handoff_reminder_minutes ?? 10);
  return {
    phone: phone.length >= 8 && phone.length <= 15 ? phone : null,
    reminder: Number.isInteger(reminder) && reminder >= 1 && reminder <= 1440 ? reminder : 10,
  };
}

export async function handleHandoffOwnerAlert(row: EventRow): Promise<HandlerResult> {
  const consumer_key = HANDOFF_OWNER_ALERT_CONSUMER;
  const conversationId = String(row.payload.conversation_id ?? row.entity_id ?? "");
  const phase = row.payload.phase === "reminder" ? "reminder" : "initial";
  if (!conversationId) return { consumer_key, status: "skipped", detail: "sem conversa" };

  const db = pool();
  const { rows } = await db.query<{
    settings: unknown;
    status: string;
    assigned_to_user_id: string | null;
    phone_number: string | null;
    channel_session_id: string;
    channel_status: string;
    channel_session: ChannelSessionRef;
    daily_message_limit: number | null;
  }>(
    `select o.settings, c.status, c.assigned_to_user_id, ct.phone_number,
            c.channel_session_id, s.status as channel_status, to_jsonb(s) as channel_session,
            s.daily_message_limit
       from conversations c
       join organizations o on o.id = c.organization_id
       join contacts ct on ct.organization_id = c.organization_id and ct.id = c.contact_id
       join channel_sessions s on s.organization_id = c.organization_id and s.id = c.channel_session_id
      where c.organization_id = $1 and c.id = $2
      limit 1`,
    [row.organization_id, conversationId],
  );
  const state = rows[0];
  if (!state) return { consumer_key, status: "skipped", detail: "conversa inexistente" };
  if (state.status !== "pending" || state.assigned_to_user_id !== null) {
    return { consumer_key, status: "skipped", detail: "conversa já assumida" };
  }

  const cfg = config(state.settings);
  if (!cfg.phone) return { consumer_key, status: "skipped", detail: "número do dono não configurado" };

  if (phase === "initial") {
    const equipe = await quemPodeAssumirAgora(db, row.organization_id, new Date());
    if (equipe.disponiveis > 0) {
      return { consumer_key, status: "skipped", detail: "há atendente disponível" };
    }
  }

  if (state.channel_status !== "WORKING") {
    return { consumer_key, status: "error", detail: "canal fora do ar para avisar o dono" };
  }

  const agora = new Date();
  const pacingCfg = await loadChannelKnobs(db, row.organization_id, state.channel_session_id);
  const pacingState = await loadPacingState(db, row.organization_id, state.channel_session_id, {
    now: agora,
    timezone: pacingCfg.knobs.timezone,
    numberActivatedAt: pacingCfg.numberActivatedAt,
  });
  const decision = decidePacing({
    now: agora,
    knobs: pacingCfg.knobs,
    state: pacingState,
    crmDailyLimit: state.daily_message_limit,
  });
  if (!decision.allow) {
    return {
      consumer_key,
      status: "retry",
      retry_at: decision.nextAllowedAt.toISOString(),
      detail: decision.code,
    };
  }
  if (decision.waitMs > 0) {
    return {
      consumer_key,
      status: "retry",
      retry_at: new Date(agora.getTime() + decision.waitMs).toISOString(),
      detail: "throttle",
    };
  }

  const admin = createAdminClient();
  const metadata = row.metadata ?? {};
  if (metadata.owner_alert_claimed_at) {
    return { consumer_key, status: "skipped", detail: "aviso já reivindicado" };
  }
  await admin
    .from("event_log")
    .update({ metadata: { ...metadata, owner_alert_claimed_at: agora.toISOString() } })
    .eq("id", row.id)
    .eq("organization_id", row.organization_id);

  try {
    const adapter = getAdapter(state.channel_session.provider);
    if (!adapter.isConfigured()) throw new Error(adapter.codes.notConfigured);
    const destino = adapter.resolveRecipient({
      isGroup: false,
      groupChatId: null,
      phoneNumber: cfg.phone,
      waIdentity: null,
    });
    if (!destino) throw new Error("número do dono não encontrado no canal");
    const minutos = phase === "reminder" ? cfg.reminder : 0;
    await adapter.send({
      organizationId: row.organization_id,
      sessionRef: resolveSessionRef(state.channel_session),
      to: destino,
      kind: "text",
      body: `A IA passou uma conversa para um humano — ${mascararTelefoneParaAviso(state.phone_number)} — há ${minutos} min.`,
    });
    await recordSend(db, row.organization_id, state.channel_session_id, agora);
  } catch (err) {
    await admin.from("event_log").update({ metadata }).eq("id", row.id).eq("organization_id", row.organization_id);
    return {
      consumer_key,
      status: "error",
      detail: err instanceof Error ? err.message.slice(0, 160) : "falha ao avisar dono",
    };
  }

  if (phase === "initial") {
    await db.query(
      `insert into event_log
         (organization_id, event_type, entity_kind, entity_id, status, next_attempt_at, payload, metadata)
       select $1, 'handoff.owner_alert_requested', 'conversation', $2, 'pending',
              now() + make_interval(mins => $3),
              jsonb_build_object('conversation_id', $2, 'phase', 'reminder'), '{}'::jsonb
       where not exists (
         select 1 from event_log
          where organization_id = $1 and event_type = 'handoff.owner_alert_requested'
            and entity_kind = 'conversation' and entity_id = $2
            and payload->>'phase' = 'reminder'
       )`,
      [row.organization_id, conversationId, cfg.reminder],
    );
  }

  return { consumer_key, status: "ok" };
}

export const handoffOwnerAlertHandler = {
  key: HANDOFF_OWNER_ALERT_CONSUMER,
  events: ["handoff.owner_alert_requested"],
  handle: handleHandoffOwnerAlert,
};
