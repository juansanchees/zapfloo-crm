import type { NextRequest } from "next/server";
import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { mfaEmDivida } from "@/lib/auth/server";
import { iniciarConexao, limitarOAuth } from "@/lib/plataformas-de-anuncio/meta/oauth/servico";
import { origemConfere, erroOrigem, erroLimite, falhaInicio, redirecionarInicio, textoOAuth } from "../_respostas";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!origemConfere(req)) return erroOrigem(req);
  const auth = await requireRole("manager", { allowPlatformAdmin: true, resource: "ad_insights_connections" });
  if (!auth.ok) return auth.response;
  // O bypass transversal do guard não pode dispensar prova de segundo fator.
  if (await mfaEmDivida()) return fail("mfa_required", textoOAuth(req, "Esta sessão precisa da verificação em duas etapas."), 403);
  if (await limitarOAuth("connect", auth.user.id)) return erroLimite(req);
  const inicio = await iniciarConexao(auth.org.orgId, auth.user.id);
  return inicio ? redirecionarInicio(inicio) : falhaInicio(false);
}
