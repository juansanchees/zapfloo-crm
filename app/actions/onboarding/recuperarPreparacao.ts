"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { contextoDoRascunho } from "@/lib/onboarding/contexto-rascunho";
import { erroDaPreparacao, prepararRascunhoSchema } from "@/lib/onboarding/preparar";
import type { ErroRascunho } from "@/lib/onboarding/rascunho";
import { OnboardingError, requireOnboardingCtx } from "./_shared";

const inputSchema = prepararRascunhoSchema.pick({ expected_context: true, expected_revision: true, expected_version_id: true }).strict();
const resultSchema = z.object({ revision: z.number().int().positive() });

/** Abandona só o vínculo indisponível; configuração e agente antigo permanecem intactos. */
export async function recuperarPreparacao(input: unknown): Promise<{ ok: true; revision: number } | { ok: false; error: ErroRascunho }> {
  try {
    const ctx = await requireOnboardingCtx();
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid_input" };
    if (parsed.data.expected_context !== contextoDoRascunho(ctx.userId, ctx.orgId)) return { ok: false, error: "draft_context_changed" };
    const { data, error } = await createAdminClient().rpc("fn_recuperar_preparacao_onboarding", {
      p_org_id: ctx.orgId, p_actor_id: ctx.userId, p_expected_revision: parsed.data.expected_revision,
      p_expected_version_id: parsed.data.expected_version_id,
    });
    if (error) {
      const code = erroDaPreparacao(error.message);
      return { ok: false, error: code === "draft_model_unavailable" || code === "draft_credential_unavailable" || code === "draft_name_conflict" || code === "draft_prompt_too_long" ? "db_error" : code };
    }
    const result = resultSchema.safeParse(data);
    return result.success ? { ok: true, revision: result.data.revision } : { ok: false, error: "db_error" };
  } catch (error) { return { ok: false, error: error instanceof OnboardingError ? error.code : "db_error" }; }
}
