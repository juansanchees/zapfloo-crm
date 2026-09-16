/**
 * Ler o estado de elegibilidade de uma conversa via `supabase-js` (service role).
 *
 * Espelho de `consulta-pg.ts` para os caminhos que NÃO têm um pool `pg` à mão —
 * o worker legado (`workers/ai-response-worker.ts`), o envio inline de texto fixo
 * do follow-up (`lib/followup/enviar-texto-fixo.ts`), o worker de sentimento e o
 * orquestrador de handoff do lado do CRM. TODOS têm de respeitar o MESMO gate
 * que o drain e o turno do agent-engine: nenhum caminho pode mandar mensagem de
 * IA para uma conversa que uma origem elegível não autorizou.
 *
 * A regra pura (`decidirElegibilidade`) e a normalização
 * (`montarEstadoDeElegibilidade`) são as mesmas dos dois lados — só o transporte
 * muda.
 *
 * ─── Fail-closed ───────────────────────────────────────────────────────────
 *
 * `decidirElegibilidadeDaConversaViaSupabase` DEVOLVE a decisão, ou `null` só
 * quando a conversa não existe. Erro de query VIRA EXCEÇÃO — e cada chamador
 * destes caminhos secundários trata exceção como "não responder" (fail-closed):
 * são caminhos de retaguarda, o caminho robusto é o do agent-engine, e um erro
 * ao ler `contacts.ai_authorized_at` quase sempre é schema pela metade (imagem
 * nova, baseline ainda não aplicado) — exatamente quando NÃO se quer a IA solta.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  decidirElegibilidade,
  montarEstadoDeElegibilidade,
  type DecisaoDeElegibilidade,
} from "./gate";

interface ConversaEmbed {
  bot_silenced_until: string | null;
  assignee_kind: string | null;
  contacts: {
    force_human: boolean | null;
    ai_authorized_at: string | null;
    phone_number: string | null;
  } | null;
  channel_sessions: { metadata: Record<string, unknown> | null } | null;
}

/**
 * Roda a query e a regra. `null` = conversa não encontrada. Lança em erro de
 * banco — o chamador (caminho secundário) trata como "não responder".
 */
export async function decidirElegibilidadeDaConversaViaSupabase(
  admin: SupabaseClient,
  input: { organizationId: string; conversationId: string; agora: Date; ttlMs: number; messageId?: string },
): Promise<DecisaoDeElegibilidade | null> {
  const { data, error } = await admin
    .from("conversations")
    .select(
      "bot_silenced_until, assignee_kind, contacts:contact_id(force_human, ai_authorized_at, phone_number), channel_sessions:channel_session_id(metadata)",
    )
    .eq("organization_id", input.organizationId)
    .eq("id", input.conversationId)
    .maybeSingle();

  if (error) {
    throw new Error(`elegibilidade: leitura falhou — ${error.message}`);
  }
  if (data == null) return null;

  const row = data as unknown as ConversaEmbed;
  const estadoBase = {
    aiGate: row.channel_sessions?.metadata?.["ai_gate"] ?? null,
    aiGateMode: row.channel_sessions?.metadata?.["ai_gate_mode"] ?? null,
    aiTestPhoneNumbers: row.channel_sessions?.metadata?.["ai_test_phone_numbers"] ?? null,
    contactPhoneNumber: row.contacts?.phone_number ?? null,
    forceHuman: row.contacts?.force_human ?? false,
    assigneeKind: row.assignee_kind,
    botSilencedUntil: row.bot_silenced_until,
    aiAuthorizedAt: row.contacts?.ai_authorized_at ?? null,
    aiStartedAt: row.channel_sessions?.metadata?.["ai_gate_started_at"] ?? null,
    agora: input.agora,
    ttlMs: input.ttlMs,
  };
  const estadoNormalizado = montarEstadoDeElegibilidade(estadoBase);
  const decisaoBase = decidirElegibilidade(estadoNormalizado);
  // Não toca a tabela de mensagens quando o número já está barrado. Além de
  // evitar I/O inútil, isto mantém o gate como primeira barreira: histórico só
  // é relevante para uma mensagem que teria permissão de seguir.
  if (!decisaoBase.permite || !input.messageId || estadoNormalizado.aiStartedAt == null) return decisaoBase;

  let messageReceivedAt: string | null = null;
  const message = await admin.from("messages").select("created_at")
    .eq("organization_id", input.organizationId)
    .eq("conversation_id", input.conversationId)
    .eq("id", input.messageId).maybeSingle();
  if (message.error) throw new Error(`elegibilidade: mensagem falhou — ${message.error.message}`);
  if (!message.data?.created_at) throw new Error("elegibilidade: mensagem não encontrada");
  messageReceivedAt = message.data.created_at;

  return decidirElegibilidade(
    montarEstadoDeElegibilidade({
      ...estadoBase,
      messageReceivedAt,
    }),
  );
}
