import { z } from "zod";
import type { ErroEnsaio } from "./ensaio";

const contextoConclusaoSchema = z.object({
  expected_context: z.string().regex(/^[a-f0-9]{64}$/),
  expected_revision: z.number().int().min(1).max(2147483647),
  expected_version_id: z.string().uuid(),
  run_id: z.string().uuid(),
});

export const confirmarAgenteRevisadoSchema = contextoConclusaoSchema.strict();
export const ativarAgenteParaTesteSchema = contextoConclusaoSchema
  .extend({ channel_session_id: z.string().uuid() })
  .strict();

export const agenteRevisadoSchema = z
  .object({ agent_id: z.string().uuid(), version_id: z.string().uuid() })
  .strict();

export const ativacaoRestritaSchema = agenteRevisadoSchema
  .extend({
    channel_session_id: z.string().uuid(),
    // jsonb_build_object(timestamptz) retorna +00:00, não necessariamente Z.
    activated_at: z.string().datetime({ offset: true }),
  })
  .strict();

/** Projeção mínima lida no servidor para provar a capacidade da chave da instalação. */
export const versaoParaAtivacaoSchema = z
  .object({
    provider: z.string().trim().min(1),
    credential_id: z.string().uuid().nullable(),
  })
  .strict();

/** Projeção mínima: prova apenas que o resolvedor canônico encontrou BYOK válida. */
export const credencialOrganizacaoParaAtivacaoSchema = z.object({ id: z.string().uuid() }).strict();

export type ErroConclusao =
  | ErroEnsaio
  | "activation_conflict"
  | "activation_channel_unavailable"
  | "activation_channel_not_restricted"
  | "activation_credential_unavailable"
  | "activation_model_unavailable"
  | "activation_agent_conflict";

export type ResultadoConfirmacao =
  | ({ ok: true } & z.infer<typeof agenteRevisadoSchema>)
  | { ok: false; error: ErroConclusao };

export type ResultadoAtivacao =
  | ({ ok: true } & z.infer<typeof ativacaoRestritaSchema>)
  | { ok: false; error: ErroConclusao };

export function erroDaConclusao(message: string): ErroConclusao {
  switch (message) {
    case "draft_invalid_input":
      return "invalid_input";
    case "draft_forbidden":
      return "forbidden";
    case "draft_conflict":
    case "draft_unavailable":
    case "draft_context_changed":
    case "draft_model_unavailable":
    case "draft_credential_unavailable":
    case "draft_name_conflict":
    case "rehearsal_conflict":
    case "rehearsal_not_completed":
    case "rehearsal_invalid_result":
    case "rehearsal_busy":
    case "activation_conflict":
    case "activation_channel_unavailable":
    case "activation_channel_not_restricted":
    case "activation_credential_unavailable":
    case "activation_model_unavailable":
    case "activation_agent_conflict":
      return message;
    default:
      return "db_error";
  }
}
