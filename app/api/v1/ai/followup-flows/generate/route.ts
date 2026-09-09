import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import {
  llmEdgeConfigFromEnv,
  LlmNotConfiguredError,
} from "@/lib/agent-engine/edge/llm/credentials";
import {
  LlmBudgetExceededError,
  normalizarErro,
} from "@/lib/agent-engine/edge/llm/run-model-call";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { env } from "@/lib/env";
import { FollowupDraftInvalidError, generateFollowupDraft } from "@/lib/followup/ai-draft";
import { generateFollowupFlowSchema } from "@/lib/followup/api-schemas";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 45;

export async function POST(request: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "followup_flows" });
  if (!authz.ok) return authz.response;
  const t = (text: string) => traduzir(text, authz.user.idioma);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parsed = generateFollowupFlowSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Descreva o fluxo com pelo menos 20 caracteres."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const rate = await checkRateLimit(
    `followup-generate:${authz.org.orgId}:${authz.user.id}`,
    8,
    60,
  );
  if (!rate.allowed) {
    return fail("rate_limited", t("Muitas criações em pouco tempo. Aguarde um minuto."), 429, {
      requestId,
      headers: { "Retry-After": String(rate.window_sec) },
    });
  }

  try {
    const graph = await generateFollowupDraft(
      { organizationId: authz.org.orgId, description: parsed.data.description },
      { pool: getRequestPool(), cfg: llmEdgeConfigFromEnv(env) },
    );
    const supabase = await createClient();
    const { data: created, error } = await supabase
      .from("followup_flow_pointers")
      .insert({
        organization_id: authz.org.orgId,
        name: parsed.data.name,
        draft_graph: graph,
      })
      .select("*")
      .single();

    if (error || !created) {
      if (error?.code === "23505") {
        return fail("conflict", t("Já existe um fluxo com este nome."), 409, { requestId });
      }
      return fail("internal_error", error?.message ?? "followup_flow_insert_failed", 500, {
        requestId,
      });
    }

    void audit({
      action: "followup_flow.created",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "followup_flow_pointer",
      resourceId: created.id,
      requestId,
      metadata: { name: parsed.data.name, generated_with_ai: true, node_count: graph.nodes.length },
    });
    return ok(created, { requestId, status: 201 });
  } catch (error) {
    if (error instanceof FollowupDraftInvalidError) {
      return fail(
        "ai_invalid_output",
        t("A IA montou um fluxo incompleto. Tente detalhar melhor as etapas."),
        502,
        { requestId },
      );
    }
    if (error instanceof LlmNotConfiguredError || (error instanceof Error && error.message.includes("SUPABASE_DB_URL"))) {
      return fail(
        "ai_not_configured",
        t("Configure uma credencial e um modelo de IA antes de criar o fluxo."),
        503,
        { requestId },
      );
    }
    if (error instanceof LlmBudgetExceededError) {
      return fail("ai_budget_exceeded", t("O orçamento de IA desta organização foi atingido."), 429, {
        requestId,
      });
    }
    const normalized = normalizarErro(error);
    if (normalized.error_code === "limite_ou_saldo") {
      return fail("ai_provider_limit", t("O provedor de IA informou limite ou saldo insuficiente."), 429, {
        requestId,
      });
    }
    if (normalized.error_code === "credencial_recusada") {
      return fail("ai_credential_error", t("Revise a credencial do provedor de IA."), 503, { requestId });
    }
    return fail("ai_unavailable", t("Não foi possível montar o fluxo agora. Tente novamente."), 503, {
      requestId,
    });
  }
}
