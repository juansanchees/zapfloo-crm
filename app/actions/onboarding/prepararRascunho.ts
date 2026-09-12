"use server";

import { z } from "zod";
import { segmentoDoNegocioSchema } from "@/lib/schemas/onboarding";
import { createAdminClient } from "@/lib/supabase/admin";
import { capacidadesPadraoDoOnboarding } from "@/lib/ai/agents/capacidades-padrao";
import { contextoDoRascunho } from "@/lib/onboarding/contexto-rascunho";
import { rascunhoSchema } from "@/lib/onboarding/rascunho";
import { promptDoRascunho } from "@/lib/onboarding/prompt";
import { erroDaPreparacao, prepararRascunhoSchema, versaoPreparadaSchema, type ResultadoPreparacao } from "@/lib/onboarding/preparar";
import { OnboardingError, requireOnboardingCtx } from "./_shared";

/** Preparação isolada: não chama o criador legado, runtime, memória ou publicação. */
export async function prepararRascunho(input: unknown): Promise<ResultadoPreparacao> {
  try {
    const ctx = await requireOnboardingCtx();
    const parsed = prepararRascunhoSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid_input" };
    if (parsed.data.expected_context !== contextoDoRascunho(ctx.userId, ctx.orgId)) {
      return { ok: false, error: "draft_context_changed" };
    }
    const admin = createAdminClient();
    const [draftRead, orgRead] = await Promise.all([
      admin.from("onboarding_drafts").select("revision,configuration").eq("organization_id", ctx.orgId).maybeSingle(),
      admin.from("organizations").select("display_name,legal_name,onboarding_state").eq("id", ctx.orgId).maybeSingle(),
    ]);
    if (draftRead.error || orgRead.error || !orgRead.data) return { ok: false, error: "db_error" };
    if (!draftRead.data) return { ok: false, error: "draft_conflict" };
    const draft = rascunhoSchema.safeParse(draftRead.data);
    if (!draft.success) return { ok: false, error: "db_error" };
    if (draft.data.revision !== parsed.data.expected_revision) return { ok: false, error: "draft_conflict" };
    const welcome = z.object({ welcome: z.object({ o_que_faz: z.string().optional(), segmento: segmentoDoNegocioSchema.optional() }).optional() })
      .safeParse(orgRead.data.onboarding_state);
    const business = {
      display_name: orgRead.data.display_name ?? orgRead.data.legal_name,
      o_que_faz: welcome.success ? welcome.data.welcome?.o_que_faz ?? null : null,
      ...(welcome.success && welcome.data.welcome?.segmento ? { segmento: welcome.data.welcome.segmento } : {}),
    };
    const systemPrompt = promptDoRascunho(draft.data.configuration, business);
    const { data, error } = await admin.rpc("fn_prepare_onboarding_draft", {
      p_org_id: ctx.orgId, p_actor_id: ctx.userId,
      p_expected_revision: parsed.data.expected_revision,
      p_expected_version_id: parsed.data.expected_version_id,
      p_expected_business: business,
      p_version: {
        system_prompt: systemPrompt, provider: parsed.data.provider, model: parsed.data.model,
        credential_id: parsed.data.credential_id, tool_ids: capacidadesPadraoDoOnboarding(),
      },
    });
    if (error) return { ok: false, error: erroDaPreparacao(error.message) };
    const prepared = versaoPreparadaSchema.safeParse(data);
    return prepared.success ? { ok: true, ...prepared.data } : { ok: false, error: "db_error" };
  } catch (error) {
    if (error instanceof OnboardingError) return { ok: false, error: error.code };
    if (error instanceof Error && error.message === "draft_prompt_too_long") return { ok: false, error: "draft_prompt_too_long" };
    return { ok: false, error: "db_error" };
  }
}
