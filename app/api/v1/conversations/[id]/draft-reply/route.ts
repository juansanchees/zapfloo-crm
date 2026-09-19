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
// Deixa margem para serializar a resposta antes do teto de 45s da função.
const SERVER_DEADLINE_MS = 40_000;

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

/**
 * Faz o deadline cobrir a rota inteira, inclusive leituras que não aceitam
 * AbortSignal nativamente. A operação subjacente pode terminar a limpeza/auditoria,
 * mas nenhum estágio seguinte começa depois que o cliente foi embora.
 */
function aguardarComSinal<T>(promise: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const abortar = () => reject(signal.reason);
    signal.addEventListener("abort", abortar, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abortar);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abortar);
        reject(error);
      },
    );
  });
}

function rateLimitHeaders(rate: {
  count: number;
  limit: number;
  window_sec: number;
  reset_at: number;
}): Record<string, string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    "Retry-After": String(Math.max(1, rate.reset_at - nowSeconds)),
    "X-RateLimit-Limit": String(rate.limit),
    "X-RateLimit-Remaining": String(Math.max(0, rate.limit - rate.count)),
    "X-RateLimit-Reset": String(rate.reset_at),
  };
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const requestId = randomUUID();
  const deadline = AbortSignal.timeout(SERVER_DEADLINE_MS);
  const signal = AbortSignal.any([req.signal, deadline]);
  const authz = await aguardarComSinal(
    requireRole("agent", { requestId, resource: "conversations" }),
    signal,
  );
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { org } = authz;
  const { id } = await aguardarComSinal(params, signal);

  const rate = await aguardarComSinal(
    checkRateLimit(
      `draft_reply:${org.orgId}:${authz.user.id}`,
      RATE_LIMIT,
      RATE_WINDOW_SECONDS,
    ),
    signal,
  );
  if (!rate.allowed) {
    return fail(
      "rate_limited",
      t("Muitas tentativas. Aguarde um minuto e tente novamente."),
      429,
      { requestId, headers: rateLimitHeaders(rate) },
    );
  }

  const supabase = await aguardarComSinal(createClient(), signal);
  const { data: conv } = await aguardarComSinal(
    supabase
      .from("conversations")
      .select("id, organization_id, contact_id, channel_session_id")
      .eq("id", id)
      .eq("organization_id", org.orgId)
      .maybeSingle(),
    signal,
  );
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
    result = await aguardarComSinal(
      generateDraftReply(
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
          signal,
        },
      ),
      signal,
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
