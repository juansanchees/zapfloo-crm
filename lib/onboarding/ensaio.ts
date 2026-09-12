import { z } from "zod";
import { PROVIDERS } from "@/lib/ai/agents/validation";
import { prepararRascunhoSchema, type ErroPreparacao } from "./preparar";

export const contextoEnsaioSchema = prepararRascunhoSchema.pick({ expected_context: true, expected_revision: true }).extend({ expected_version_id: z.string().uuid() }).strict();
export const iniciarEnsaioSchema = contextoEnsaioSchema.extend({ sample_message: z.string().trim().min(1).max(4000) }).strict();
export const revisarEnsaioSchema = contextoEnsaioSchema.extend({ run_id: z.string().uuid() }).strict();
// Projeta somente o necessário à IA; ferramentas e configuração mutável ficam fora.
export const snapshotEnsaioSchema = z.object({
  id: z.string().uuid(), agent_id: z.string().uuid(), organization_id: z.string().uuid(),
  provider: z.enum(PROVIDERS), model: z.string().min(1), credential_id: z.string().uuid().nullable(),
  system_prompt: z.string().min(10).max(20000), status: z.literal("draft"), channel_session_id: z.null(),
}).readonly();
export const inicioEnsaioSchema = z.object({ run_id: z.string().uuid(), snapshot: snapshotEnsaioSchema });
export const falhaExecucaoSchema = z.enum(["not_configured", "budget_exceeded", "provider_error", "empty_response", "incomplete_response"]);
export const provaEnsaioSchema = z.object({
  run_id: z.string().uuid(), revision: z.number().int().positive(), version_id: z.string().uuid(),
  sample_message: z.string(), status: z.enum(["running", "completed", "failed"]), response: z.string().nullable(),
  call_id: z.string().uuid().nullable(), error: falhaExecucaoSchema.nullable(), reviewed: z.boolean(),
}).superRefine((p, ctx) => {
  if ((p.status === "completed" && (!p.response?.trim() || !p.call_id || p.error)) || (p.reviewed && p.status !== "completed")) {
    ctx.addIssue({ code: "custom", message: "Prova inconsistente" });
  }
});
export const selecaoEnsaioSchema = z.object({
  revision: z.number().int().positive(), agent_id: z.string().uuid(), version_id: z.string().uuid(),
  provider: z.enum(PROVIDERS), model: z.string(), credential_id: z.string().uuid().nullable(),
});
export const painelEnsaioSchema = z.object({
  recovery_available: z.boolean().optional(),
  selection: selecaoEnsaioSchema.nullable(), proof: provaEnsaioSchema.nullable(),
  models: z.array(z.object({ provider: z.enum(PROVIDERS), model_id: z.string(), display_name: z.string() })),
  credentials: z.array(z.object({ id: z.string().uuid(), provider: z.enum(PROVIDERS), label: z.string() })),
});
export type ProvaEnsaio = z.infer<typeof provaEnsaioSchema>;
export type PainelEnsaio = z.infer<typeof painelEnsaioSchema>;

// ID confirmado no catálogo curado (migration 0104 + baseline). Só o onboarding
// escolhe automaticamente; os seletores avançados do agente continuam intactos.
export const MODELO_PADRAO_ENSAIO = { provider: "openai", model_id: "gpt-5.6-luna" } as const;

/** O catálogo recebido já contém só modelos ativos compatíveis, na ordem da instalação. */
export function selecionarModeloEnsaio(models: PainelEnsaio["models"]) {
  // Clones podem ter catálogos diferentes. Sem o padrão, seguimos com o primeiro;
  // sem catálogo algum, a tela oferece continuar depois em vez de lançar ou inventar ID.
  return models.find(m => m.provider === MODELO_PADRAO_ENSAIO.provider && m.model_id === MODELO_PADRAO_ENSAIO.model_id)
    ?? models[0] ?? null;
}

export type ErroEnsaio = ErroPreparacao | "rehearsal_conflict" | "rehearsal_not_completed" | "rehearsal_invalid_result" | "rehearsal_busy" | "rehearsal_rate_limited";
export type ResultadoEnsaio = { ok: true; proof: ProvaEnsaio } | { ok: false; error: ErroEnsaio };
export type LeituraEnsaio = { ok: true; panel: PainelEnsaio } | { ok: false; error: ErroEnsaio };
