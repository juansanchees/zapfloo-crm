import type { NextRequest } from "next/server";
import { z } from "zod";
import { iniciarConexao, lerLinkAutorizado, limitarOAuth } from "@/lib/plataformas-de-anuncio/meta/oauth/servico";
import { origemConfere, erroOrigem, erroLimite, falhaInicio, redirecionarInicio, lerCorpoLimitado } from "../_respostas";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!origemConfere(req)) return erroOrigem(req);
  if (await limitarOAuth("agency", null)) return erroLimite(req);
  let token: string;
  try {
    const body = await lerCorpoLimitado(req, 8192);
    if (body === null) return falhaInicio(true);
    const entrada = z.string().min(1).max(2048).safeParse(new URLSearchParams(body).get("link"));
    if (!entrada.success) return falhaInicio(true);
    token = entrada.data;
  } catch {
    return falhaInicio(true);
  }
  if (await limitarOAuth("agency_link", token)) return erroLimite(req);
  const link = await lerLinkAutorizado(token);
  if (!link) return falhaInicio(true);
  // Org e ator vêm do recibo assinado/lido do banco, nunca do form público.
  const inicio = await iniciarConexao(link.organization_id, link.user_id, link.id);
  return inicio ? redirecionarInicio(inicio) : falhaInicio(true);
}
