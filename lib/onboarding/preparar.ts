import { z } from "zod";
import { PROVIDERS } from "@/lib/ai/agents/validation";
import type { ErroRascunho } from "./rascunho";

export const prepararRascunhoSchema = z.object({
  expected_context: z.string().regex(/^[a-f0-9]{64}$/),
  expected_revision: z.number().int().min(1).max(2147483647),
  expected_version_id: z.string().uuid().nullable(),
  provider: z.enum(PROVIDERS),
  model: z.string().trim().min(1).max(120),
  credential_id: z.string().uuid().nullable(),
}).strict();

export const versaoPreparadaSchema = z.object({
  revision: z.number().int().min(1),
  agent_id: z.string().uuid(),
  version_id: z.string().uuid(),
}).strict();

export type ErroPreparacao = ErroRascunho | "draft_model_unavailable" | "draft_credential_unavailable"
  | "draft_name_conflict" | "draft_prompt_too_long";
export type ResultadoPreparacao = { ok: true } & z.infer<typeof versaoPreparadaSchema>
  | { ok: false; error: ErroPreparacao };

/** Não devolver mensagens arbitrárias de SQL, SDK ou credenciais ao navegador. */
export function erroDaPreparacao(message: string): ErroPreparacao {
  switch (message) {
    case "draft_invalid_input": return "invalid_input";
    case "draft_forbidden": return "forbidden";
    case "draft_conflict":
    case "draft_unavailable":
    case "draft_context_changed":
    case "draft_model_unavailable":
    case "draft_credential_unavailable":
    case "draft_name_conflict": return message;
    default: return "db_error";
  }
}
