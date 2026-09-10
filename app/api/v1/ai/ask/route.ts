import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { runCopilot } from "@/lib/ai/copilot/run";
import { copilotRequestSchema } from "@/lib/ai/copilot/schema";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import {
  llmEdgeConfigFromEnv,
  LlmNotConfiguredError,
} from "@/lib/agent-engine/edge/llm/credentials";
import { LlmBudgetExceededError, normalizarErro } from "@/lib/agent-engine/edge/llm/run-model-call";
import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { env } from "@/lib/env";
import { traduzir } from "@/lib/i18n/dicionario";
import { validateRequest } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 45;

const RATE_LIMIT = 20;
const RATE_WINDOW_SECONDS = 60;

export async function POST(request: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "copilot" });
  if (!authz.ok) return authz.response;
  const t = (text: string) => traduzir(text, authz.user.idioma);

  let input;
  try {
    input = await validateRequest(copilotRequestSchema, request);
  } catch (error) {
    if (error instanceof ApiError) {
      return fail(error.code, error.message, error.status, {
        details: error.details,
        requestId,
      });
    }
    throw error;
  }

  const rate = await checkRateLimit(
    `copilot:${authz.org.orgId}:${authz.user.id}`,
    RATE_LIMIT,
    RATE_WINDOW_SECONDS,
  );
  if (!rate.allowed) {
    return fail(
      "rate_limited",
      t("Muitas perguntas em pouco tempo. Aguarde um minuto e tente novamente."),
      429,
      { requestId, headers: { "Retry-After": String(rate.window_sec) } },
    );
  }

  try {
    const result = await runCopilot(
      {
        organizationId: authz.org.orgId,
        userId: authz.user.id,
        role: authz.org.role,
        requestId,
        idioma: authz.user.idioma,
        question: input.question,
        history: input.history,
        // Entrada por sessão: as ferramentas compartilham a RLS da tela.
        // O ingresso MCP por api_token mantém seu cliente de integração próprio.
        supabase: await createClient(),
      },
      {
        pool: getRequestPool(),
        cfg: llmEdgeConfigFromEnv(env),
      },
    );
    return ok(result, { requestId });
  } catch (error) {
    if (error instanceof LlmNotConfiguredError) {
      return fail(
        "ai_not_configured",
        t("Configure uma credencial e um modelo de IA antes de usar o copiloto."),
        503,
        { requestId },
      );
    }
    if (error instanceof LlmBudgetExceededError) {
      return fail(
        "ai_budget_exceeded",
        t("O orçamento de IA desta organização foi atingido."),
        429,
        { requestId },
      );
    }
    if (error instanceof Error && error.message === "empty_response") {
      return fail("ai_empty_response", t("A IA não conseguiu formar uma resposta."), 502, {
        requestId,
      });
    }

    const normalized = normalizarErro(error);
    if (normalized.error_code === "credencial_recusada") {
      return fail(
        "ai_credential_error",
        t("O provedor de IA recusou a credencial. Revise a configuração de IA."),
        503,
        { requestId },
      );
    }
    if (normalized.error_code === "limite_ou_saldo") {
      return fail(
        "ai_provider_limit",
        t("O provedor de IA informou limite ou saldo insuficiente."),
        429,
        { requestId },
      );
    }
    if (normalized.error_code === "provedor_indisponivel") {
      const timeout = error instanceof Error && /timeout|aborted/i.test(error.message);
      return fail(
        timeout ? "ai_timeout" : "ai_unavailable",
        t(
          timeout
            ? "A análise demorou mais que o esperado. Tente uma pergunta mais curta."
            : "O provedor de IA está indisponível. Tente novamente em instantes.",
        ),
        timeout ? 504 : 503,
        { requestId },
      );
    }
    return fail("internal_error", t("Não foi possível concluir a análise."), 500, {
      requestId,
    });
  }
}
