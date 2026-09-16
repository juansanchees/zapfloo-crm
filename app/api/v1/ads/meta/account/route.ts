import type { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { mfaEmDivida } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";
import { listarContas } from "@/lib/plataformas-de-anuncio/meta/insights";
import { limitarOAuth } from "@/lib/plataformas-de-anuncio/meta/oauth/servico";
import { CABECALHOS_PRIVADOS, erroLimite, erroOrigem, origemConfere, lerCorpoLimitado, textoOAuth } from "../oauth/_respostas";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const t = (texto: string) => textoOAuth(req, texto);
  if (!origemConfere(req)) return erroOrigem(req);
  const auth = await requireRole("manager", { allowPlatformAdmin: true, resource: "ad_insights_connections" });
  if (!auth.ok) return auth.response;
  if (await mfaEmDivida()) return fail("mfa_required", t("Esta sessão precisa da verificação em duas etapas."), 403);
  if (await limitarOAuth("account", auth.user.id)) return erroLimite(req);
  let bruto: unknown;
  try {
    const body = await lerCorpoLimitado(req, 1024);
    if (body === null) return fail("validation_failed", t("Escolha uma conta de anúncios válida."), 422);
    bruto = JSON.parse(body);
  } catch {
    return fail("validation_failed", t("Escolha uma conta de anúncios válida."), 422);
  }
  const entrada = z.object({ default_account_id: z.string().regex(/^act_\d+$/).max(100) }).strict().safeParse(bruto);
  if (!entrada.success) return fail("validation_failed", t("Escolha uma conta de anúncios válida."), 422);
  const admin = createAdminClient();
  const { data: conexao, error: erroConexao } = await admin.from("ad_insights_connections")
    .select("access_token_encrypted").eq("organization_id", auth.org.orgId).eq("platform", "meta_ads").maybeSingle();
  if (erroConexao || !conexao?.access_token_encrypted) return fail("not_connected", t("Conecte a conta de anúncios antes de continuar."), 409);
  const cifrado = String(conexao.access_token_encrypted);
  const token = await decryptWebhookSecret(admin, cifrado);
  if (!token) return fail("connection_unavailable", t("Não foi possível conferir a conexão. Tente novamente."), 503);
  // A lista existente é a autoridade dos ids alcançáveis. Nunca confiar num
  // act_... recebido só porque passa no formato, nem devolver o bearer à UI.
  const contas = await listarContas(token);
  if (!contas.ok) return fail("connection_unavailable", t("Não foi possível conferir a conexão. Tente novamente."), 503);
  if (!contas.dados.some((conta) => conta.id === entrada.data.default_account_id)) {
    return fail("forbidden_account", t("Escolha uma conta de anúncios válida."), 403);
  }
  const { data, error } = await admin.rpc("fn_ad_insights_mutar_conexao", {
    p_organization_id: auth.org.orgId, p_user_id: auth.user.id, p_operation: "select_account",
    p_default_account_id: entrada.data.default_account_id, p_alterar_conta: true,
    p_expected_token_encrypted: cifrado,
  });
  if (error || data?.status !== "ok") return fail("connection_changed", t("A conexão mudou. Atualize a lista e escolha a conta novamente."), 409);
  await audit({
    action: "ad_insights_connection.updated", actorUserId: auth.user.id, organizationId: auth.org.orgId,
    resourceType: "ad_insights_connections",
    metadata: { default_account_id: entrada.data.default_account_id, token_trocado: false },
  });
  return ok({ default_account_id: entrada.data.default_account_id }, { headers: CABECALHOS_PRIVADOS });
}
