import { z } from "zod";
import { aiAgentDefaultSchema } from "@/lib/schemas/onboarding";

// Intenção preparatória, sem modelo, credencial, canal ou versão executável.
export const configuracaoRascunhoSchema = aiAgentDefaultSchema.extend({
  name: z.string().trim().min(2).max(80),
  regras_da_casa: z.string().max(20000),
  objetivo: z.string().optional(),
}).strict();
export const rascunhoInputSchema = z.object({
  expected_context: z.string().regex(/^[a-f0-9]{64}$/),
  expected_revision: z.number().int().min(0).max(2147483647),
  configuration: configuracaoRascunhoSchema,
}).strict();
export const rascunhoSchema = z.object({
  revision: z.number().int().min(1).max(2147483647),
  configuration: configuracaoRascunhoSchema,
});
export type Rascunho = z.infer<typeof rascunhoSchema>;
export type ErroRascunho = "auth_required" | "no_active_org" | "forbidden" | "mfa_required"
  | "not_found" | "db_error" | "invalid_input" | "draft_conflict" | "draft_unavailable" | "draft_context_changed";
export type LeituraRascunho = { ok: true; context: string; draft: Rascunho | null } | { ok: false; error: ErroRascunho };
