"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { rascunhoInputSchema, rascunhoSchema, type ErroRascunho, type LeituraRascunho } from "@/lib/onboarding/rascunho";
import { OnboardingError, requireOnboardingCtx } from "./_shared";
import { contextoDoRascunho } from "@/lib/onboarding/contexto-rascunho";

/** A RPC grava rascunho e audit juntos; esta entrada nunca publica nem escolhe IA. */
export async function salvarRascunho(input: unknown): Promise<{ ok: true; revision: number } | { ok: false; error: ErroRascunho }> {
  try {
    const ctx = await requireOnboardingCtx();
    const parsed = rascunhoInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid_input" };
    if (parsed.data.expected_context !== contextoDoRascunho(ctx.userId, ctx.orgId)) {
      return { ok: false, error: "draft_context_changed" };
    }
    const { data, error } = await createAdminClient().rpc("fn_save_onboarding_draft", {
      p_org_id: ctx.orgId,
      p_actor_id: ctx.userId,
      p_expected_revision: parsed.data.expected_revision,
      p_configuration: parsed.data.configuration,
    });
    if (error) {
      const code: ErroRascunho = error.message === "draft_conflict" ? "draft_conflict"
        : error.message === "draft_unavailable" ? "draft_unavailable"
        : error.message === "draft_forbidden" ? "forbidden"
        : error.message === "draft_prompt_too_long" ? "draft_prompt_too_long"
        : error.message === "draft_invalid_input" ? "invalid_input" : "db_error";
      return { ok: false, error: code };
    }
    const result = rascunhoSchema.safeParse(data);
    return result.success ? { ok: true, revision: result.data.revision } : { ok: false, error: "db_error" };
  } catch (error) {
    return { ok: false, error: error instanceof OnboardingError ? error.code : "db_error" };
  }
}

/** Erro de leitura é distinto de ausência; não apagar um formulário por falha do banco. */
export async function lerRascunho(): Promise<LeituraRascunho> {
  try {
    const ctx = await requireOnboardingCtx();
    const { data, error } = await createAdminClient().from("onboarding_drafts")
      .select("revision,configuration").eq("organization_id", ctx.orgId).maybeSingle();
    if (error) return { ok: false, error: "db_error" };
    const context = contextoDoRascunho(ctx.userId, ctx.orgId);
    if (!data) return { ok: true, context, draft: null };
    const parsed = rascunhoSchema.safeParse(data);
    return parsed.success ? { ok: true, context, draft: parsed.data } : { ok: false, error: "db_error" };
  } catch (error) {
    return { ok: false, error: error instanceof OnboardingError ? error.code : "db_error" };
  }
}
