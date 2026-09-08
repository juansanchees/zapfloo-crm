"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { contextoDoRascunho } from "@/lib/onboarding/contexto-rascunho";
import { executarEnsaio } from "@/lib/onboarding/executar-ensaio";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { erroDaPreparacao } from "@/lib/onboarding/preparar";
import { inicioEnsaioSchema, iniciarEnsaioSchema, painelEnsaioSchema, provaEnsaioSchema, revisarEnsaioSchema, type ErroEnsaio, type LeituraEnsaio, type ResultadoEnsaio } from "@/lib/onboarding/ensaio";
import { OnboardingError, requireOnboardingCtx } from "./_shared";

function erro(message: string): ErroEnsaio {
  return message === "rehearsal_conflict" || message === "rehearsal_not_completed" || message === "rehearsal_invalid_result" || message === "rehearsal_busy" ? message : erroDaPreparacao(message);
}
function resultado(data: unknown): ResultadoEnsaio {
  const parsed = provaEnsaioSchema.safeParse(data);
  return parsed.success ? { ok: true, proof: parsed.data } : { ok: false, error: "db_error" };
}

/** IDs/revisão/mensagem apenas; snapshot, identidade e resultado nunca vêm do browser. */
export async function iniciarEnsaio(input: unknown): Promise<ResultadoEnsaio> {
  try {
    const ctx = await requireOnboardingCtx();
    const parsed = iniciarEnsaioSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid_input" };
    const p = parsed.data;
    if (p.expected_context !== contextoDoRascunho(ctx.userId, ctx.orgId)) return { ok: false, error: "draft_context_changed" };
    // Contenção técnica do ensaio, pelo contador compartilhado; não altera o orçamento comercial.
    if (!(await checkRateLimit(`onboarding-rehearsal:${ctx.orgId}`, 6, 60)).allowed) return { ok: false, error: "rehearsal_rate_limited" };
    const admin = createAdminClient();
    const trusted = { p_org_id: ctx.orgId, p_actor_id: ctx.userId, p_expected_revision: p.expected_revision, p_expected_version_id: p.expected_version_id };
    const start = await admin.rpc("fn_iniciar_ensaio_onboarding", { ...trusted, p_sample_message: p.sample_message });
    if (start.error) return { ok: false, error: erro(start.error.message) };
    const captured = inicioEnsaioSchema.safeParse(start.data);
    if (!captured.success || captured.data.snapshot.organization_id !== ctx.orgId || captured.data.snapshot.id !== p.expected_version_id) return { ok: false, error: "db_error" };
    const response = await executarEnsaio(captured.data.snapshot, p.sample_message);
    const end = await admin.rpc("fn_finalizar_ensaio_onboarding", { ...trusted, p_run_id: captured.data.run_id,
      p_response: response.ok ? response.response : null, p_call_id: response.call_id, p_error: response.ok ? null : response.error });
    return end.error ? { ok: false, error: erro(end.error.message) } : resultado(end.data);
  } catch (error) { return { ok: false, error: error instanceof OnboardingError ? error.code : "db_error" }; }
}

export async function revisarEnsaio(input: unknown): Promise<ResultadoEnsaio> {
  try {
    const ctx = await requireOnboardingCtx(); const parsed = revisarEnsaioSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid_input" };
    const p = parsed.data;
    if (p.expected_context !== contextoDoRascunho(ctx.userId, ctx.orgId)) return { ok: false, error: "draft_context_changed" };
    const res = await createAdminClient().rpc("fn_revisar_ensaio_onboarding", { p_org_id: ctx.orgId, p_actor_id: ctx.userId,
      p_expected_revision: p.expected_revision, p_expected_version_id: p.expected_version_id, p_run_id: p.run_id });
    return res.error ? { ok: false, error: erro(res.error.message) } : resultado(res.data);
  } catch (error) { return { ok: false, error: error instanceof OnboardingError ? error.code : "db_error" }; }
}

/** Projeção mínima: ciphertext/IV/tag não são selecionados e nunca atravessam RSC. */
export async function lerEnsaio(input: unknown): Promise<LeituraEnsaio> {
  try {
    const ctx = await requireOnboardingCtx();
    const p = z.object({ expected_context: z.string() }).strict().safeParse(input);
    if (!p.success) return { ok: false, error: "invalid_input" };
    if (p.data.expected_context !== contextoDoRascunho(ctx.userId, ctx.orgId)) return { ok: false, error: "draft_context_changed" };
    const admin = createAdminClient();
    const [draft, models, credentials] = await Promise.all([
      admin.from("onboarding_drafts").select("revision,prepared_revision,prepared_agent_id,prepared_version_id,prepared_snapshot,rehearsal").eq("organization_id", ctx.orgId).maybeSingle(),
      admin.from("ai_models").select("provider,model_id,display_name").is("deprecated_at", null).eq("supports_tools", true).order("display_name"),
      admin.from("ai_provider_credentials").select("id,provider,label").eq("organization_id", ctx.orgId).eq("is_active", true).not("validated_at", "is", null),
    ]);
    if (draft.error || models.error || credentials.error) return { ok: false, error: "db_error" };
    let selection = null; let proof = null;
    if (draft.data?.prepared_version_id) {
      const snapshot = z.object({ provider: z.string(), model: z.string(), credential_id: z.string().nullable() }).safeParse(draft.data.prepared_snapshot);
      if (!snapshot.success) return { ok: false, error: "db_error" };
      selection = { revision: draft.data.prepared_revision, agent_id: draft.data.prepared_agent_id, version_id: draft.data.prepared_version_id, ...snapshot.data };
      // Só devolver prova atual. A RPC revalida guard, negócio, agente e snapshot completo.
      const valid = await admin.rpc("fn_validar_ensaio_onboarding", { p_org_id: ctx.orgId, p_actor_id: ctx.userId,
        p_expected_revision: draft.data.revision, p_expected_version_id: draft.data.prepared_version_id });
      if (!valid.error && JSON.stringify(valid.data) === JSON.stringify(draft.data.prepared_snapshot)) {
        const rehearsal = z.object({ snapshot: z.unknown() }).passthrough().safeParse(draft.data.rehearsal);
        if (rehearsal.success && JSON.stringify(rehearsal.data.snapshot) === JSON.stringify(valid.data)) proof = provaEnsaioSchema.parse(rehearsal.data);
      } else if (valid.error && !["draft_conflict", "draft_context_changed", "draft_model_unavailable", "draft_credential_unavailable"].includes(valid.error.message)) {
        return { ok: false, error: erro(valid.error.message) };
      }
    }
    const parsed = painelEnsaioSchema.safeParse({ selection, proof, models: models.data, credentials: credentials.data });
    return parsed.success ? { ok: true, panel: parsed.data } : { ok: false, error: "db_error" };
  } catch (error) { return { ok: false, error: error instanceof OnboardingError ? error.code : "db_error" }; }
}
