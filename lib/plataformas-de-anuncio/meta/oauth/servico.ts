import "server-only";

import { z } from "zod";

import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";

import { configuracaoOAuth, montarUrlConsentimento } from "./config";
import {
  assinarEstado,
  assinarLink,
  gerarVinculoNavegador,
  hashVinculoNavegador,
  VALIDADE_ESTADO_MS,
  VALIDADE_LINK_MS,
  verificarLink,
} from "./estado";

// O proxy importa o módulo leve; os consumidores do serviço mantêm o contrato existente.
export { limitarOAuth } from "./limite";

const reciboSchema = z.object({
  status: z.literal("ok"),
  id: z.uuid(),
  expires_at: z.string().datetime({ offset: true }),
});

/** A permissão do gerador é reconferida ao usar o link, não só ao emiti-lo. */
async function geradorContinuaAutorizado(organizationId: string, userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: membro, error } = await admin.from("user_organizations")
    .select("role")
    .eq("organization_id", organizationId).eq("user_id", userId)
    .is("revoked_at", null).not("accepted_at", "is", null).maybeSingle();
  if (error) return false;
  if (membro?.role === "manager" || membro?.role === "admin") return true;
  const { data: plataforma, error: erroPlataforma } = await admin.from("platform_admins")
    .select("user_id").eq("user_id", userId).eq("scope", "full")
    .is("revoked_at", null).maybeSingle();
  return !erroPlataforma && Boolean(plataforma);
}

const linkSchema = z.object({
  id: z.uuid(), organization_id: z.uuid(), user_id: z.uuid(),
  expires_at: z.string().datetime({ offset: true }),
  consumed_at: z.null(), revoked_at: z.null(), kind: z.literal("link"),
});

/**
 * Única resolução global: ID aleatório vindo de um link cuja assinatura já foi
 * verificada. Só depois desta consulta existe uma organização confiável; todas
 * as consultas e RPCs seguintes recebem esse escopo, nunca o body do visitante.
 */
export async function lerLinkAutorizado(token: string) {
  const assinado = verificarLink(token);
  if (!assinado) return null;
  const { data, error } = await createAdminClient().from("ad_insights_oauth_requests")
    .select("id,organization_id,user_id,expires_at,consumed_at,revoked_at,kind")
    .eq("id", assinado.requestId).eq("kind", "link").maybeSingle();
  if (error) return null;
  const lido = linkSchema.safeParse(data);
  if (!lido.success) return null;
  const linha = lido.data;
  // O prazo local pode ser MENOR: relógio do banco e da aplicação são
  // independentes. A assinatura nunca pode prolongar o recibo do banco.
  if (Date.parse(linha.expires_at) <= Date.now() ||
      assinado.expiresAt > Date.parse(linha.expires_at)) return null;
  if (!await geradorContinuaAutorizado(linha.organization_id, linha.user_id)) return null;
  return linha;
}

/** O RSC público só recebe nome: não recebe ids, membros nem configuração. */
export async function lerPaginaDoLink(token: string): Promise<{ ok: true; nome: string } | { ok: false }> {
  const link = await lerLinkAutorizado(token);
  if (!link) return { ok: false };
  const { data, error } = await createAdminClient().from("organizations")
    .select("display_name").eq("id", link.organization_id).eq("status", "active")
    .is("suspended_at", null).is("redacted_at", null).maybeSingle();
  if (error || typeof data?.display_name !== "string") return { ok: false };
  return { ok: true, nome: data.display_name };
}

export async function criarLinkDeConexao(organizationId: string, userId: string) {
  // Antes da RPC: latência de banco não renova a janela assinada.
  const agora = new Date();
  const { data, error } = await createAdminClient().rpc("fn_ad_insights_oauth_emitir_link", {
    p_organization_id: organizationId, p_user_id: userId,
  });
  const recibo = reciboSchema.safeParse(data);
  if (error || !recibo.success) return null;
  const expiresAt = Math.min(Date.parse(recibo.data.expires_at), agora.getTime() + VALIDADE_LINK_MS);
  if (expiresAt <= Date.now()) return null;
  const prazoEfetivo = new Date(expiresAt).toISOString();
  const token = assinarLink({ requestId: recibo.data.id, expiresAt }, agora);
  if (!token) return null;
  await audit({
    action: "ad_insights_oauth.link_created", actorUserId: userId, organizationId,
    resourceType: "ad_insights_oauth_requests", resourceId: recibo.data.id,
    metadata: { expires_at: prazoEfetivo },
  });
  return {
    url: new URL(`/ads/connect/${token}`, env.NEXT_PUBLIC_APP_URL).toString(),
    expires_at: prazoEfetivo,
  };
}

/** Consome o link e cria uma sessão separada; GET/prefetch nunca consome nada. */
export async function iniciarConexao(organizationId: string, userId: string, linkId?: string) {
  const config = configuracaoOAuth();
  if (!config) return null;
  const vinculo = gerarVinculoNavegador();
  const digest = hashVinculoNavegador(vinculo);
  if (!digest) return null;
  const agora = new Date();
  const { data, error } = await createAdminClient().rpc("fn_ad_insights_oauth_iniciar", {
    p_organization_id: organizationId, p_user_id: userId,
    p_browser_digest: digest, p_link_id: linkId ?? null,
  });
  const recibo = reciboSchema.safeParse(data);
  if (error || !recibo.success) return null;
  const expiresAt = Math.min(Date.parse(recibo.data.expires_at), agora.getTime() + VALIDADE_ESTADO_MS);
  if (expiresAt <= Date.now()) return null;
  const state = assinarEstado({
    requestId: recibo.data.id, organizationId, userId,
    expiresAt,
  }, agora);
  if (!state) return null;
  await audit({
    action: linkId ? "ad_insights_oauth.link_used" : "ad_insights_oauth.started",
    actorUserId: userId, organizationId,
    resourceType: "ad_insights_oauth_requests", resourceId: recibo.data.id,
    metadata: { origin: linkId ? "agency" : "direct", expires_at: new Date(expiresAt).toISOString() },
  });
  return { url: montarUrlConsentimento(config, state), vinculo, requestId: recibo.data.id };
}

export async function guardarConexaoOAuth(dados: {
  organizationId: string; requestId: string; browserDigest: string;
  accessToken: string; tokenType: string; tokenExpiresAt: string | null;
  dataAccessExpiresAt: string | null; checkedAt: string;
}): Promise<boolean> {
  const admin = createAdminClient();
  const cifrado = await encryptWebhookSecret(admin, dados.accessToken);
  if (!cifrado) return false;
  const { data, error } = await admin.rpc("fn_ad_insights_oauth_concluir", {
    p_organization_id: dados.organizationId, p_request_id: dados.requestId,
    p_browser_digest: dados.browserDigest, p_access_token_encrypted: cifrado,
    // A conta antiga pode não ser alcançável pelo token novo. A escolha
    // reaparece pela lista existente depois da conexão.
    p_default_account_id: null,
    p_token_expires_at: dados.tokenExpiresAt,
    p_data_access_expires_at: dados.dataAccessExpiresAt,
    p_token_type: dados.tokenType, p_token_checked_at: dados.checkedAt,
  });
  return !error && data?.status === "ok";
}
