/**
 * POST /api/v1/conversations/:id/draft-reply — sugere um rascunho de resposta
 * pra o composer (sob demanda, sem enviar nada). Onda 5.1.
 *
 * Reusa `generateDraftReply` (agent-engine) via um pool de Postgres próprio
 * do processo Next.js — sem tools, sem guardrails de envio (revisão humana
 * antes de sair). O rate limit por organização + pessoa fecha rajadas
 * concorrentes antes do modelo; o orçamento continua sendo a segunda camada.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { generateDraftReply, type DraftReplyResult } from "@/lib/agent-engine/agent/draft-reply";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { crmEdgeConfigFromEnv } from "@/lib/agent-engine/edge/crm/mcp-client";
import {
  llmEdgeConfigFromEnv,
  LlmNotConfiguredError,
  normalizarErro,
} from "@/lib/agent-engine/edge/llm/run-model-call";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 45;

// Mesmo teto do outro ingresso interativo de IA (`/api/v1/ai/ask`): não
// inventa uma segunda política e impede rajadas que correm antes do recibo.
const RATE_LIMIT = 20;
const RATE_WINDOW_SECONDS = 60;

interface RouteParams {
  params: Promise<{ id: string }>;
}

const REASON_TO_RESPONSE: Record<
  Exclude<DraftReplyResult, { ok: true }>["reason"],
  [code: string, message: string, status: number]
> = {
  blocked: ["blocked", "Contato bloqueado/anonimizado.", 422],
  empty: ["empty", "A IA não gerou um rascunho.", 422],
  error: ["internal_error", "Erro ao gerar rascunho.", 500],
};

export async function POST(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { org } = authz;
  const { id } = await params;

  const rate = await checkRateLimit(
    `draft_reply:${org.orgId}:${authz.user.id}`,
    RATE_LIMIT,
    RATE_WINDOW_SECONDS,
  );
  if (!rate.allowed) {
    return fail(
      "rate_limited",
      t("Muitas tentativas. Aguarde um minuto e tente novamente."),
      429,
      { requestId, headers: { "Retry-After": String(rate.window_sec) } },
    );
  }

  const supabase = await createClient();
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, organization_id, contact_id, channel_session_id")
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (!conv) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });
  if (!conv.contact_id || !conv.channel_session_id) {
    return fail("unprocessable", t("Conversa sem contato/canal."), 422, { requestId });
  }

  let pool;
  try {
    pool = getRequestPool();
  } catch {
    return fail("unavailable", t("Rascunho da IA indisponível (config)."), 503, { requestId });
  }

  let result: DraftReplyResult;
  try {
    result = await generateDraftReply(
      pool,
      llmEdgeConfigFromEnv(env),
      crmEdgeConfigFromEnv({
        SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
      }),
      {
        tenantId: org.orgId,
        leadId: conv.contact_id,
        conversationId: conv.id,
        channelSessionId: conv.channel_session_id,
      },
    );
  } catch (error) {
    // Configuração ausente ou chave recusada não pode tirar do vendedor o
    // caminho humano. Outros incidentes (orçamento, timeout, provider fora)
    // continuam visíveis pelo tratamento global já existente.
    if (
      error instanceof LlmNotConfiguredError ||
      normalizarErro(error).error_code === "credencial_recusada"
    ) {
      return ok({ suggestions: [] }, { requestId });
    }
    throw error;
  }

  if (!result.ok) {
    const [code, message, status] = REASON_TO_RESPONSE[result.reason];
    return fail(code, t(message), status, { requestId });
  }
  return ok({ suggestions: result.suggestions }, { requestId });
}
