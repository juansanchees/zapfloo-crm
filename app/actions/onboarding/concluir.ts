"use server";

import { chaveDePlataforma } from "@/lib/ai/runtime/agent";
import { contextoDoRascunho } from "@/lib/onboarding/contexto-rascunho";
import {
  agenteRevisadoSchema,
  ativacaoRestritaSchema,
  ativarAgenteParaTesteSchema,
  confirmarAgenteRevisadoSchema,
  credencialOrganizacaoParaAtivacaoSchema,
  erroDaConclusao,
  versaoParaAtivacaoSchema,
  type ErroConclusao,
  type ResultadoAtivacao,
  type ResultadoConfirmacao,
} from "@/lib/onboarding/concluir";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  OnboardingError,
  requireOnboardingCtx,
} from "./_shared";

function erroDaBorda(error: unknown): ErroConclusao {
  return error instanceof OnboardingError ? error.code : "db_error";
}

export async function confirmarAgenteRevisado(input: unknown): Promise<ResultadoConfirmacao> {
  try {
    const ctx = await requireOnboardingCtx();
    const parsed = confirmarAgenteRevisadoSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid_input" };
    const p = parsed.data;
    if (p.expected_context !== contextoDoRascunho(ctx.userId, ctx.orgId)) {
      return { ok: false, error: "draft_context_changed" };
    }

    const { data, error } = await createAdminClient().rpc(
      "fn_confirmar_agente_revisado_onboarding",
      {
        p_org_id: ctx.orgId,
        p_actor_id: ctx.userId,
        p_expected_revision: p.expected_revision,
        p_expected_version_id: p.expected_version_id,
        p_run_id: p.run_id,
      },
    );
    if (error) return { ok: false, error: erroDaConclusao(error.message) };
    const result = agenteRevisadoSchema.safeParse(data);
    return result.success
      ? { ok: true, ...result.data }
      : { ok: false, error: "db_error" };
  } catch (error) {
    return { ok: false, error: erroDaBorda(error) };
  }
}

export async function ativarAgenteParaTeste(input: unknown): Promise<ResultadoAtivacao> {
  try {
    const ctx = await requireOnboardingCtx();
    const parsed = ativarAgenteParaTesteSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid_input" };
    const p = parsed.data;
    if (p.expected_context !== contextoDoRascunho(ctx.userId, ctx.orgId)) {
      return { ok: false, error: "draft_context_changed" };
    }

    const admin = createAdminClient();
    const versionRead = await admin
      .from("ai_agent_versions")
      .select("provider,credential_id")
      .eq("id", p.expected_version_id)
      .eq("organization_id", ctx.orgId)
      .maybeSingle();
    if (versionRead.error || !versionRead.data) return { ok: false, error: "db_error" };
    const version = versaoParaAtivacaoSchema.safeParse(versionRead.data);
    if (!version.success) return { ok: false, error: "db_error" };

    // Replica a precedência do resolvedor canônico: BYOK explícita, depois a
    // credencial válida mais recente da organização e só então a instalação.
    // O browser não fornece provider, credential_id, ID resolvido nem capacidade.
    let installationKeyAvailable = false;
    if (version.data.credential_id === null) {
      const orgCredentialRead = await admin
        .from("ai_provider_credentials")
        .select("id")
        .eq("organization_id", ctx.orgId)
        .eq("provider", version.data.provider)
        .eq("is_active", true)
        .not("validated_at", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (orgCredentialRead.error) return { ok: false, error: "db_error" };
      if (orgCredentialRead.data) {
        const orgCredential = credencialOrganizacaoParaAtivacaoSchema.safeParse(
          orgCredentialRead.data,
        );
        if (!orgCredential.success) return { ok: false, error: "db_error" };
      } else {
        installationKeyAvailable = Boolean(chaveDePlataforma(version.data.provider));
      }
    }
    const { data, error } = await admin.rpc("fn_ativar_agente_teste_onboarding", {
      p_org_id: ctx.orgId,
      p_actor_id: ctx.userId,
      p_expected_revision: p.expected_revision,
      p_expected_version_id: p.expected_version_id,
      p_run_id: p.run_id,
      p_channel_session_id: p.channel_session_id,
      p_installation_key_available: installationKeyAvailable,
    });
    if (error) return { ok: false, error: erroDaConclusao(error.message) };
    const result = ativacaoRestritaSchema.safeParse(data);
    return result.success
      ? { ok: true, ...result.data }
      : { ok: false, error: "db_error" };
  } catch (error) {
    return { ok: false, error: erroDaBorda(error) };
  }
}
