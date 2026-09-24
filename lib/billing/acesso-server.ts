import type pg from "pg";

import {
  decidirAcessoComercial,
  type AccessDecision,
  type AccessDecisionReason,
} from "@/lib/billing/acesso-comercial";
import type { SituacaoComercialDaAssinatura } from "@/lib/billing/planos";
import { createAdminClient } from "@/lib/supabase/admin";

export type ProjecaoComercial = {
  status: SituacaoComercialDaAssinatura;
  organizationCreatedAt: string | null;
  paidThrough: string | null;
  enforcementEnabled: boolean;
  isPlatformAdmin: boolean;
};

export type ContextoDaLeituraComercial = {
  actorUserId?: string | null;
};

export type LeitorDaProjecaoComercial = (
  organizationId: string,
  contexto: ContextoDaLeituraComercial,
) => Promise<ProjecaoComercial>;

export class AcessoComercialBloqueadoError extends Error {
  override readonly name = "commercial_access_blocked";
  readonly code = "commercial_access_blocked";

  constructor(readonly decision: AccessDecision) {
    super("O acesso desta organização está bloqueado pela situação da assinatura.");
  }
}

export class EstadoComercialIndisponivelError extends Error {
  override readonly name = "commercial_access_unavailable";
  readonly code = "commercial_access_unavailable";
}

export type DetalhesDoBloqueioComercial = {
  reason: AccessDecisionReason;
  access_until: string | null;
  enforcement_enabled: boolean;
};

export function serializarBloqueioComercial(
  erro: AcessoComercialBloqueadoError,
): DetalhesDoBloqueioComercial {
  return {
    reason: erro.decision.reason,
    access_until: erro.decision.accessUntil,
    enforcement_enabled: erro.decision.enforcementEnabled,
  };
}

/** Única porta tenant que continua navegável durante o bloqueio comercial. */
export function rotaPermitidaDuranteBloqueioComercial(pathname: string): boolean {
  return pathname === "/app/settings/billing" || pathname.startsWith("/app/settings/billing/");
}

/** Exceções explícitas da borda de API. Inbound público não passa por `requireRole`. */
export function rotaApiPermitidaDuranteBloqueioComercial(pathname: string): boolean {
  return [
    "/api/v1/billing",
    "/api/v1/auth/logout",
    "/api/v1/webhooks/",
    "/api/v1/postbacks/",
    "/api/v1/monetizze/",
  ].some((prefixo) => pathname === prefixo.replace(/\/$/, "") || pathname.startsWith(prefixo));
}

async function lerProjecaoComercialViaSupabase(
  organizationId: string,
  contexto: ContextoDaLeituraComercial,
): Promise<ProjecaoComercial> {
  const admin = createAdminClient();
  const [org, assinatura, configuracao, plataforma] = await Promise.all([
    admin.from("organizations").select("created_at").eq("id", organizationId).maybeSingle(),
    admin
      .from("organization_subscriptions")
      .select("status, paid_through")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    admin
      .from("platform_billing_settings")
      .select("enforcement_enabled")
      .eq("singleton", true)
      .maybeSingle(),
    contexto.actorUserId
      ? admin
          .from("platform_admins")
          .select("user_id")
          .eq("user_id", contexto.actorUserId)
          .is("revoked_at", null)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const erro = org.error ?? assinatura.error ?? configuracao.error ?? plataforma.error;
  if (erro || !org.data) {
    throw new EstadoComercialIndisponivelError(
      erro?.message ?? "Organização inexistente ao avaliar a situação comercial.",
    );
  }

  return {
    // Ausência de linha é compatibilidade explícita com organizações anteriores
    // à tabela de planos. `ativo` sem paid_through é reconhecido pela decisão
    // pura como `legacy_unreviewed`, não como pagamento inventado.
    status: (assinatura.data?.status ?? "ativo") as SituacaoComercialDaAssinatura,
    organizationCreatedAt: String(org.data.created_at),
    paidThrough: assinatura.data?.paid_through ?? null,
    enforcementEnabled: configuracao.data?.enforcement_enabled === true,
    isPlatformAdmin: plataforma.data !== null,
  };
}

export type OpcoesDeAcessoComercial = {
  now?: Date;
  leitor?: LeitorDaProjecaoComercial;
  actorUserId?: string | null;
  isPlatformAdmin?: boolean;
};

export async function destinoComercialDoShell(
  organizationId: string,
  pathname: string,
  opcoes: OpcoesDeAcessoComercial = {},
): Promise<"permitir" | "billing"> {
  try {
    const decisao = await avaliarAcessoComercial(organizationId, opcoes);
    return decisao.allowed || rotaPermitidaDuranteBloqueioComercial(pathname)
      ? "permitir"
      : "billing";
  } catch (erro) {
    if (!(erro instanceof EstadoComercialIndisponivelError)) throw erro;
    // Degradação segura: nunca abre o app, mas também não transforma a tela de
    // regularização em 500/loop durante uma falha transitória do leitor.
    return rotaPermitidaDuranteBloqueioComercial(pathname) ? "permitir" : "billing";
  }
}

/** Adapter único do veredito comercial para app, APIs e workers Supabase. */
export async function avaliarAcessoComercial(
  organizationId: string,
  opcoes: OpcoesDeAcessoComercial = {},
): Promise<AccessDecision> {
  if (opcoes.isPlatformAdmin === true) {
    return decidirAcessoComercial({
      status: "ativo",
      organizationCreatedAt: "1970-01-01T00:00:00.000Z",
      paidThrough: null,
      enforcementEnabled: true,
      isPlatformAdmin: true,
      now: opcoes.now ?? new Date(),
    });
  }

  const projecao = await (opcoes.leitor ?? lerProjecaoComercialViaSupabase)(organizationId, {
    actorUserId: opcoes.actorUserId,
  });
  return decidirAcessoComercial({
    ...projecao,
    now: opcoes.now ?? new Date(),
  });
}

export async function exigirAcessoComercial(
  organizationId: string,
  opcoes: OpcoesDeAcessoComercial = {},
): Promise<AccessDecision> {
  const decisao = await avaliarAcessoComercial(organizationId, opcoes);
  if (!decisao.allowed) throw new AcessoComercialBloqueadoError(decisao);
  return decisao;
}

async function lerProjecaoComercialViaPg(
  pool: pg.Pool,
  organizationId: string,
): Promise<ProjecaoComercial> {
  const { rows } = await pool.query<{
    organization_created_at: Date | string;
    status: string | null;
    paid_through: Date | string | null;
    enforcement_enabled: boolean | null;
  }>(
    `select o.created_at as organization_created_at,
            s.status,
            s.paid_through,
            coalesce(p.enforcement_enabled, false) as enforcement_enabled
       from organizations o
       left join organization_subscriptions s on s.organization_id = o.id
       left join platform_billing_settings p on p.singleton = true
      where o.id = $1`,
    [organizationId],
  );
  const linha = rows[0];
  if (!linha) {
    throw new EstadoComercialIndisponivelError(
      "Organização inexistente ao avaliar a situação comercial.",
    );
  }
  const iso = (valor: Date | string | null): string | null =>
    valor === null ? null : valor instanceof Date ? valor.toISOString() : String(valor);
  return {
    status: (linha.status ?? "ativo") as SituacaoComercialDaAssinatura,
    organizationCreatedAt: iso(linha.organization_created_at),
    paidThrough: iso(linha.paid_through),
    enforcementEnabled: linha.enforcement_enabled === true,
    isPlatformAdmin: false,
  };
}

/** Mesmo adapter, para processos `pg`; worker não representa um platform admin. */
export async function exigirAcessoComercialViaPg(
  pool: pg.Pool,
  organizationId: string,
  now = new Date(),
): Promise<AccessDecision> {
  return exigirAcessoComercial(organizationId, {
    now,
    leitor: (orgId) => lerProjecaoComercialViaPg(pool, orgId),
  });
}
