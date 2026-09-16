import type pg from "pg";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import {
  detalhesDaFalhaRegistrada,
  erroIndicaSaldoEsgotado,
  llmEdgeConfigFromEnv,
  LlmBudgetExceededError,
  LlmNotConfiguredError,
  normalizarErro,
  runModelCall,
  type LlmEdgeConfig,
  type RunModelCallDeps,
} from "@/lib/agent-engine/edge/llm/run-model-call";
import { env } from "@/lib/env";
import { snapshotEnsaioSchema, type falhaExecucaoSchema } from "./ensaio";
import type { z } from "zod";

type Resultado = { ok: true; response: string; call_id: string; model_used: string } | { ok: false; error: z.infer<typeof falhaExecucaoSchema>; call_id: string | null };

async function modelosReserva(pool: pg.Pool, provider: string, principal: string): Promise<string[]> {
  try {
    const { rows } = await pool.query<{ model_id: string }>(
      `select model_id from ai_models
        where provider = $1 and model_id <> $2 and deprecated_at is null and supports_tools is true
        order by input_price_per_million_cents asc nulls last,
                 output_price_per_million_cents asc nulls last, model_id asc
       limit 1`,
      [provider, principal],
    );
    return rows.map((row) => row.model_id).filter(Boolean);
  } catch {
    // Catálogo indisponível não pode esconder o erro original do modelo padrão.
    return [];
  }
}

function classificarFalha(error: unknown): { error: z.infer<typeof falhaExecucaoSchema>; call_id: string | null; modeloInexistente: boolean } {
  if (error instanceof LlmNotConfiguredError) return { error: "not_configured", call_id: null, modeloInexistente: false };
  if (error instanceof LlmBudgetExceededError) return { error: "budget_exceeded", call_id: null, modeloInexistente: false };
  const registrada = detalhesDaFalhaRegistrada(error);
  const normalizada = normalizarErro(error);
  const errorCode = registrada?.errorCode ?? normalizada.error_code;
  const callId = registrada?.callId ?? null;
  if (errorCode === "credencial_recusada") return { error: "provider_credential", call_id: callId, modeloInexistente: false };
  if (errorCode === "modelo_inexistente") return { error: "provider_model", call_id: callId, modeloInexistente: true };
  if (errorCode === "limite_ou_saldo") {
    return {
      error: registrada && erroIndicaSaldoEsgotado(registrada) ? "provider_quota" : "provider_error",
      call_id: callId,
      modeloInexistente: false,
    };
  }
  const mensagem = error instanceof Error ? error.message : String(error);
  if (/timeout|abort/i.test(mensagem)) return { error: "provider_timeout", call_id: callId, modeloInexistente: false };
  return { error: "provider_error", call_id: callId, modeloInexistente: false };
}

/** Prévia técnica: 30s e até 1200 tokens de saída; não testa ferramentas, memória ou canais. */
export async function executarEnsaio(snapshot: unknown, message: string, deps?: { pool: pg.Pool; cfg: LlmEdgeConfig; registry?: RunModelCallDeps["registry"] }): Promise<Resultado> {
  // Zod projeta e congela os campos primitivos; nenhuma releitura durante a rede.
  const captured = snapshotEnsaioSchema.parse(snapshot);
  const pool = deps?.pool ?? getRequestPool();
  const cfg = deps?.cfg ?? llmEdgeConfigFromEnv(env);
  let modelos = [captured.model];
  for (let index = 0; index < modelos.length; index += 1) {
    const model = modelos[index]!;
    try {
      const call = await runModelCall(pool, cfg, {
        tenantId: captured.organization_id, agentId: captured.agent_id, purpose: "onboarding_rehearsal",
        system: captured.system_prompt, messages: [{ role: "user", content: message }],
        model, llmOverride: { provider: captured.provider, credentialId: captured.credential_id },
        selectionMode: "explicit", timeoutMs: 30000, maxOutputTokens: 1200,
      }, deps?.registry ? { registry: deps.registry } : {});
      if (call.result.finishReason !== "stop") return { ok: false, error: "incomplete_response", call_id: call.callId };
      const response = call.result.text.trim();
      if (!response) return { ok: false, error: "empty_response", call_id: call.callId };
      if (response.length > 12000 || !call.callId) return { ok: false, error: "incomplete_response", call_id: call.callId };
      return { ok: true, response, call_id: call.callId, model_used: model };
    } catch (error) {
      const falha = classificarFalha(error);
      if (falha.modeloInexistente && modelos.length === 1) {
        modelos = [captured.model, ...await modelosReserva(pool, captured.provider, captured.model)];
      }
      if (falha.modeloInexistente && index + 1 < modelos.length) continue;
      return { ok: false, error: falha.error, call_id: falha.call_id };
    }
  }
  return { ok: false, error: "provider_model", call_id: null };
}
