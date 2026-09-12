import type pg from "pg";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { runModelCall, llmEdgeConfigFromEnv, LlmBudgetExceededError, LlmNotConfiguredError, type LlmEdgeConfig, type RunModelCallDeps } from "@/lib/agent-engine/edge/llm/run-model-call";
import { env } from "@/lib/env";
import { snapshotEnsaioSchema, type falhaExecucaoSchema } from "./ensaio";
import type { z } from "zod";

type Resultado = { ok: true; response: string; call_id: string } | { ok: false; error: z.infer<typeof falhaExecucaoSchema>; call_id: string | null };
/** Prévia técnica: 30s e até 1200 tokens de saída; não testa ferramentas, memória ou canais. */
export async function executarEnsaio(snapshot: unknown, message: string, deps?: { pool: pg.Pool; cfg: LlmEdgeConfig; registry?: RunModelCallDeps["registry"] }): Promise<Resultado> {
  try {
    // Zod projeta e congela os campos primitivos; nenhuma releitura durante a rede.
    const captured = snapshotEnsaioSchema.parse(snapshot);
    const call = await runModelCall(deps?.pool ?? getRequestPool(), deps?.cfg ?? llmEdgeConfigFromEnv(env), {
      tenantId: captured.organization_id, agentId: captured.agent_id, purpose: "onboarding_rehearsal",
      system: captured.system_prompt, messages: [{ role: "user", content: message }],
      model: captured.model, llmOverride: { provider: captured.provider, credentialId: captured.credential_id },
      selectionMode: "explicit", timeoutMs: 30000, maxOutputTokens: 1200,
    }, deps?.registry ? { registry: deps.registry } : {});
    if (call.result.finishReason !== "stop") return { ok: false, error: "incomplete_response", call_id: call.callId };
    const response = call.result.text.trim();
    if (!response) return { ok: false, error: "empty_response", call_id: call.callId };
    if (response.length > 12000 || !call.callId) return { ok: false, error: "incomplete_response", call_id: call.callId };
    return { ok: true, response, call_id: call.callId };
  } catch (error) {
    return { ok: false, error: error instanceof LlmNotConfiguredError ? "not_configured" : error instanceof LlmBudgetExceededError ? "budget_exceeded" : "provider_error", call_id: null };
  }
}
