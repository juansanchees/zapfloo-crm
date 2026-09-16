/**
 * Ler o estado de elegibilidade de uma conversa via pool `pg` (o transporte do
 * agent-engine). Uma query, três tabelas: o modo do gate do canal, as travas do
 * contato, o silêncio da conversa.
 *
 * O drain (decide ENFILEIRAR) e o turno (decide RODAR) chamam isto e passam o
 * resultado para `decidirElegibilidade` — a MESMA regra pura.
 */
import type pg from "pg";

import {
  decidirElegibilidade,
  montarEstadoDeElegibilidade,
  type DecisaoDeElegibilidade,
} from "./gate";

interface LinhaDeElegibilidade {
  channel_metadata: Record<string, unknown> | null;
  force_human: boolean | null;
  assignee_kind: string | null;
  bot_silenced_until: Date | string | null;
  ai_authorized_at: Date | string | null;
  phone_number: string | null;
}

/**
 * Roda a query e a regra. `null` = conversa não encontrada (deixe o chamador
 * decidir; o drain trata como "sem gate", segue o fluxo antigo).
 */
export async function decidirElegibilidadeDaConversa(
  pool: pg.Pool,
  input: { organizationId: string; conversationId: string; agora: Date; ttlMs: number; messageId?: string },
): Promise<DecisaoDeElegibilidade | null> {
  const { rows } = await pool.query<LinhaDeElegibilidade>(
    `select
       cs.metadata                  as channel_metadata,
       ct.force_human               as force_human,
       cv.assignee_kind             as assignee_kind,
       cv.bot_silenced_until        as bot_silenced_until,
       ct.ai_authorized_at          as ai_authorized_at,
       ct.phone_number              as phone_number
     from conversations cv
     join contacts ct
       on ct.id = cv.contact_id and ct.organization_id = cv.organization_id
     join channel_sessions cs
       on cs.id = cv.channel_session_id and cs.organization_id = cv.organization_id
     where cv.organization_id = $1 and cv.id = $2`,
    [input.organizationId, input.conversationId],
  );
  const r = rows[0];
  if (r === undefined) return null;

  const estadoBase = {
    aiGate: r.channel_metadata?.ai_gate,
    aiGateMode: r.channel_metadata?.ai_gate_mode,
    aiTestPhoneNumbers: r.channel_metadata?.ai_test_phone_numbers,
    contactPhoneNumber: r.phone_number,
    forceHuman: r.force_human,
    assigneeKind: r.assignee_kind,
    botSilencedUntil: r.bot_silenced_until,
    aiAuthorizedAt: r.ai_authorized_at,
    aiStartedAt: r.channel_metadata?.ai_gate_started_at,
    agora: input.agora,
    ttlMs: input.ttlMs,
  };
  const estadoNormalizado = montarEstadoDeElegibilidade(estadoBase);
  const decisaoBase = decidirElegibilidade(estadoNormalizado);
  if (!decisaoBase.permite || !input.messageId || estadoNormalizado.aiStartedAt == null) return decisaoBase;

  const mensagem = await pool.query<{ created_at: Date | string }>(
    `select created_at from messages
      where organization_id = $1 and conversation_id = $2 and id = $3`,
    [input.organizationId, input.conversationId, input.messageId],
  );
  if (mensagem.rows[0]?.created_at == null) {
    throw new Error("elegibilidade: mensagem não encontrada");
  }
  return decidirElegibilidade(montarEstadoDeElegibilidade({
    ...estadoBase,
    messageReceivedAt: mensagem.rows[0].created_at,
  }));
}
