import type { NextRequest } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { configuracaoOAuth } from "@/lib/plataformas-de-anuncio/meta/oauth/config";
import { trocarEValidarCodigo } from "@/lib/plataformas-de-anuncio/meta/oauth/cliente";
import { verificarEstado, hashVinculoNavegador } from "@/lib/plataformas-de-anuncio/meta/oauth/estado";
import { guardarConexaoOAuth, limitarOAuth } from "@/lib/plataformas-de-anuncio/meta/oauth/servico";
import { erroLimite, nomeCookie, terminarOAuth } from "../_respostas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const consumoSchema = z.object({
  status: z.literal("ok"), user_id: z.uuid(), origin: z.enum(["direct", "agency"]),
});

export async function GET(req: NextRequest) {
  const parametros = req.nextUrl.searchParams;
  // O state é hasheado pelo limitador: sem IP, a mesma tentativa continua limitada.
  // State ausente não cria balde global e é recusado logo abaixo, antes do banco.
  if (await limitarOAuth("callback", parametros.get("state"), req.headers)) return erroLimite(req);
  const estado = verificarEstado(parametros.get("state"));
  if (!estado) return terminarOAuth(req, "erro", true);
  const cookies = req.cookies.getAll(nomeCookie(estado.requestId));
  const digest = cookies.length === 1 ? hashVinculoNavegador(cookies[0]?.value ?? "") : null;
  if (!digest) return terminarOAuth(req, "erro", true, estado.requestId);

  // A RPC confere vínculo/organização/ator/validade e consome atomicamente.
  // Não há chamada ao provedor antes desta decisão, nem retry de um code.
  const { data, error } = await createAdminClient().rpc("fn_ad_insights_oauth_consumir", {
    p_organization_id: estado.organizationId, p_request_id: estado.requestId, p_browser_digest: digest,
  });
  const recibo = consumoSchema.safeParse(data);
  if (error || !recibo.success || recibo.data.user_id !== estado.userId) {
    return terminarOAuth(req, "erro", true, estado.requestId);
  }
  const agencia = recibo.data.origin === "agency";
  const terminar = (status: "conectado" | "cancelado" | "erro") => terminarOAuth(req, status, agencia, estado.requestId);
  async function falhar(motivo: string) {
    await audit({
      action: "ad_insights_oauth.failed", organizationId: estado!.organizationId,
      actorUserId: estado!.userId, resourceType: "ad_insights_oauth_requests", resourceId: estado!.requestId,
      // Somente nossos códigos fechados. Não registrar erros/respostas do provedor.
      metadata: { reason: motivo, origin: agencia ? "agency" : "direct" },
    });
    return terminar("erro");
  }
  if (parametros.has("error")) {
    await audit({
      action: "ad_insights_oauth.cancelled", organizationId: estado.organizationId,
      actorUserId: estado.userId, resourceType: "ad_insights_oauth_requests",
      resourceId: estado.requestId,
    });
    return terminar("cancelado");
  }
  const code = z.string().min(1).max(4096).safeParse(parametros.get("code"));
  if (!code.success) return falhar("code_missing");
  const config = configuracaoOAuth();
  if (!config) return falhar("not_configured");
  const token = await trocarEValidarCodigo(config, code.data, new Date());
  if (!token.ok) return falhar(token.error);
  const salvo = await guardarConexaoOAuth({
    organizationId: estado.organizationId, requestId: estado.requestId, browserDigest: digest,
    accessToken: token.accessToken, tokenType: token.tokenType,
    tokenExpiresAt: token.tokenExpiresAt, dataAccessExpiresAt: token.dataAccessExpiresAt, checkedAt: token.checkedAt,
  });
  if (!salvo) return falhar("connection_not_saved");
  await audit({
    action: "ad_insights_connection.updated", actorUserId: estado.userId, organizationId: estado.organizationId,
    resourceType: "ad_insights_connections", metadata: { origin: agencia ? "agency" : "direct", token_trocado: true },
  });
  return terminar("conectado");
}
