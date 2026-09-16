import type { NextRequest } from "next/server";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { mfaEmDivida } from "@/lib/auth/server";
import { configuracaoOAuth } from "@/lib/plataformas-de-anuncio/meta/oauth/config";
import { criarLinkDeConexao, limitarOAuth } from "@/lib/plataformas-de-anuncio/meta/oauth/servico";
import { CABECALHOS_PRIVADOS, origemConfere, erroOrigem, erroLimite, textoOAuth } from "../_respostas";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!origemConfere(req)) return erroOrigem(req);
  const auth = await requireRole("manager", { allowPlatformAdmin: true, resource: "ad_insights_oauth_requests" });
  if (!auth.ok) return auth.response;
  if (await mfaEmDivida()) return fail("mfa_required", textoOAuth(req, "Esta sessão precisa da verificação em duas etapas."), 403);
  if (!configuracaoOAuth()) return fail("not_configured", textoOAuth(req, "A conexão automática não está disponível nesta instalação."), 503);
  if (await limitarOAuth("links", auth.user.id)) return erroLimite(req);
  const link = await criarLinkDeConexao(auth.org.orgId, auth.user.id);
  if (!link) return fail("connection_unavailable", textoOAuth(req, "Não foi possível gerar o link. Tente novamente."), 503);
  return ok(link, { status: 201, headers: CABECALHOS_PRIVADOS });
}
