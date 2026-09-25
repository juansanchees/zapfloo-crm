import type pg from "pg";
import type { NextResponse } from "next/server";

import {
  decidirAcessoComercial,
  type AccessDecision,
  type AccessDecisionReason,
} from "@/lib/billing/acesso-comercial";
import type { SituacaoComercialDaAssinatura } from "@/lib/billing/planos";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail, type ApiError } from "@/lib/api/wrappers";
import { logger } from "@/lib/logger";

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
  override readonly name: string = "commercial_access_unavailable";
  readonly code: string = "commercial_access_unavailable";

  constructor(message: string, readonly sourceCode: string | null = null) {
    super(message);
  }
}

/** Ausência confirmada não é uma indisponibilidade transitória e nunca abre acesso. */
export class OrganizacaoComercialInexistenteError extends EstadoComercialIndisponivelError {
  override readonly name = "commercial_organization_not_found";
  override readonly code = "commercial_organization_not_found";
}

export type FalhaDaLeituraComercial = {
  organizationId: string;
  erro: Error;
};

type DependenciasDoAvisoComercial = {
  agoraEmMs?: () => number;
  intervaloMs?: number;
  logar?: (mensagem: string, contexto: Record<string, unknown>) => void;
  registrarIncidente?: () => Promise<void>;
  capturarNoSentry?: (falha: FalhaDaLeituraComercial) => Promise<void>;
};

const INTERVALO_AVISO_COMERCIAL_MS = 5 * 60_000;
const TIPO_INCIDENTE_COBRANCA_INDISPONIVEL = "billing_verification_unavailable";
const CODIGO_POSTGRES_TRANSITORIO = /^(?:08|53|57P0|40001$|40P01$)/;
const CODIGO_POSTGREST_TRANSITORIO = /^PGRST00[0-3]$/;
const CODIGOS_REDE_TRANSITORIOS = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETDOWN",
  "ENETUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "ETIMEDOUT",
]);

function codigoDoErro(erro: unknown): string | null {
  if (erro instanceof EstadoComercialIndisponivelError) return erro.sourceCode;
  if (!erro || typeof erro !== "object" || !("code" in erro)) return null;
  return typeof erro.code === "string" ? erro.code.toUpperCase() : null;
}

function mensagemDoErro(erro: unknown): string {
  if (erro instanceof Error) return erro.message;
  if (erro && typeof erro === "object" && "message" in erro && typeof erro.message === "string") {
    return erro.message;
  }
  return "Falha desconhecida ao ler a situação comercial.";
}

function erroEhTransitorioDeLeitura(erro: unknown): boolean {
  if (erro instanceof EstadoComercialIndisponivelError) return true;
  const codigo = codigoDoErro(erro);
  if (codigo && (
    CODIGOS_REDE_TRANSITORIOS.has(codigo)
    || CODIGO_POSTGRES_TRANSITORIO.test(codigo)
    || CODIGO_POSTGREST_TRANSITORIO.test(codigo)
  )) return true;
  const mensagem = mensagemDoErro(erro).toLowerCase();
  return /fetch failed|network error|socket hang up|conex[aã]o (?:recusada|reiniciada|encerrada)|timed? ?out|timeout/.test(mensagem);
}

function comoIndisponibilidadeTransitoria(erro: unknown): EstadoComercialIndisponivelError {
  if (erro instanceof EstadoComercialIndisponivelError) return erro;
  return new EstadoComercialIndisponivelError(mensagemDoErro(erro), codigoDoErro(erro));
}

function contextoSeguroDaFalha(falha: FalhaDaLeituraComercial): Record<string, unknown> {
  const codigo = codigoDoErro(falha.erro) ?? undefined;
  return {
    subsystem: "billing",
    organization_id: falha.organizationId,
    error_name: falha.erro.name,
    error_code: codigo,
  };
}

async function registrarIncidenteComercialIndisponivel(): Promise<void> {
  const { error } = await createAdminClient().from("incidents").insert({
    organization_id: null,
    type: TIPO_INCIDENTE_COBRANCA_INDISPONIVEL,
    severity: "critical",
    payload: {
      message: "A verificação de cobrança está indisponível; o acesso foi mantido para não interromper clientes.",
      subsystem: "billing",
    },
  });
  // Corrida entre processos é esperada e resolvida pelo índice único parcial.
  if (error && error.code !== "23505") throw new Error(error.message);
}

async function capturarFalhaComercialNoSentry(falha: FalhaDaLeituraComercial): Promise<void> {
  const Sentry = await import("@sentry/nextjs");
  const codigo = codigoDoErro(falha.erro);
  const erroSanitizado = new Error("A verificação de cobrança está indisponível.");
  erroSanitizado.name = "BillingVerificationUnavailable";
  Sentry.captureException(erroSanitizado, {
    level: "error",
    tags: {
      subsystem: "billing",
      reason: "verification_unavailable",
      source_error_code: codigo ?? "unknown",
    },
  });
}

/**
 * Loga toda falha, mas limita incidente e Sentry a uma tentativa por janela.
 * A janela expira mesmo se a primeira escrita falhar: uma queda longa volta a
 * avisar sem transformar cada requisição em escrita/telemetria.
 */
export function criarAvisadorDeIndisponibilidadeComercial(
  dependencias: DependenciasDoAvisoComercial = {},
): (falha: FalhaDaLeituraComercial) => void {
  const agoraEmMs = dependencias.agoraEmMs ?? Date.now;
  const intervaloMs = dependencias.intervaloMs ?? INTERVALO_AVISO_COMERCIAL_MS;
  const logar = dependencias.logar ?? ((mensagem, contexto) => logger.error(mensagem, contexto));
  const registrarIncidente = dependencias.registrarIncidente ?? registrarIncidenteComercialIndisponivel;
  const capturarNoSentry = dependencias.capturarNoSentry ?? capturarFalhaComercialNoSentry;
  let proximaTentativaEm = 0;

  return (falha) => {
    logar("billing: verificação comercial indisponível; acesso mantido", contextoSeguroDaFalha(falha));
    const agora = agoraEmMs();
    if (agora < proximaTentativaEm) return;
    proximaTentativaEm = agora + intervaloMs;

    void Promise.resolve()
      .then(registrarIncidente)
      .catch((erro: unknown) => {
        logar("billing: falha ao registrar incidente de verificação indisponível", {
          subsystem: "billing",
          error_name: erro instanceof Error ? erro.name : "unknown",
        });
      });
    void Promise.resolve()
      .then(() => capturarNoSentry(falha))
      .catch((erro: unknown) => {
        logar("billing: falha ao enviar indisponibilidade ao Sentry", {
          subsystem: "billing",
          error_name: erro instanceof Error ? erro.name : "unknown",
        });
      });
  };
}

const avisarIndisponibilidadeComercial = criarAvisadorDeIndisponibilidadeComercial();

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
export function rotaApiPermitidaDuranteBloqueioComercial(
  pathname: string,
  method: string,
): boolean {
  const chave = `${method.toUpperCase()} ${pathname}`;
  return new Set([
    "POST /api/v1/billing/checkout",
    "POST /api/v1/auth/logout",
  ]).has(chave);
}

export async function lerProjecaoComercialViaSupabase(
  organizationId: string,
  contexto: ContextoDaLeituraComercial,
  admin = createAdminClient(),
): Promise<ProjecaoComercial> {
  const leituras = await Promise.all([
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
  ]).catch((erro: unknown) => {
    if (!erroEhTransitorioDeLeitura(erro)) throw erro;
    throw comoIndisponibilidadeTransitoria(erro);
  });
  const [org, assinatura, configuracao, plataforma] = leituras;

  if (org.error) {
    if (!erroEhTransitorioDeLeitura(org.error)) throw new Error(org.error.message);
    throw comoIndisponibilidadeTransitoria(org.error);
  }
  if (!org.data) {
    throw new OrganizacaoComercialInexistenteError(
      "Organização inexistente ao avaliar a situação comercial.",
    );
  }
  const erro = assinatura.error ?? configuracao.error ?? plataforma.error;
  if (erro) {
    if (!erroEhTransitorioDeLeitura(erro)) throw new Error(erro.message);
    throw comoIndisponibilidadeTransitoria(erro);
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
  aoFalharLeitura?: (falha: FalhaDaLeituraComercial) => void;
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
    if (!(erro instanceof OrganizacaoComercialInexistenteError)) throw erro;
    // Organização inexistente continua fechada; só falha transitória abre.
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

  let projecao: ProjecaoComercial;
  try {
    projecao = await (opcoes.leitor ?? lerProjecaoComercialViaSupabase)(organizationId, {
      actorUserId: opcoes.actorUserId,
    });
  } catch (erro) {
    if (erro instanceof OrganizacaoComercialInexistenteError) throw erro;
    if (!(erro instanceof EstadoComercialIndisponivelError)) throw erro;
    try {
      (opcoes.aoFalharLeitura ?? avisarIndisponibilidadeComercial)({
        organizationId,
        erro,
      });
    } catch (erroDoAviso) {
      // Telemetria nunca participa do veredito comercial.
      logger.error("billing: o avisador de indisponibilidade falhou", {
        subsystem: "billing",
        error_name: erroDoAviso instanceof Error ? erroDoAviso.name : "unknown",
      });
    }
    return {
      allowed: true,
      reason: "billing_check_unavailable",
      accessUntil: null,
      enforcementEnabled: false,
    };
  }
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

/** Resposta HTTP compartilhada para rotas tenant mutáveis que não usam `requireRole`. */
export async function recusaComercialDaMutacao(
  organizationId: string | null,
  opcoes: OpcoesDeAcessoComercial & { requestId?: string } = {},
): Promise<NextResponse<ApiError> | null> {
  try {
    // O id vazio só é aceito pelo bypass explícito de platform admin e nunca
    // chega ao leitor. Sem bypass, ausência de org falha fechada como 503.
    if (!organizationId && opcoes.isPlatformAdmin !== true) {
      throw new OrganizacaoComercialInexistenteError("Organização ausente na mutação comercial.");
    }
    await exigirAcessoComercial(organizationId ?? "", opcoes);
    return null;
  } catch (erro) {
    if (erro instanceof AcessoComercialBloqueadoError) {
      return fail("commercial_access_blocked", erro.message, 402, {
        requestId: opcoes.requestId,
        details: serializarBloqueioComercial(erro),
      });
    }
    if (erro instanceof EstadoComercialIndisponivelError) {
      return fail("commercial_access_unavailable", erro.message, 503, {
        requestId: opcoes.requestId,
      });
    }
    throw erro;
  }
}

async function lerProjecaoComercialViaPg(
  pool: pg.Pool,
  organizationId: string,
): Promise<ProjecaoComercial> {
  let rows: Array<{
    organization_created_at: Date | string;
    status: string | null;
    paid_through: Date | string | null;
    enforcement_enabled: boolean | null;
  }>;
  try {
    ({ rows } = await pool.query(
      `select o.created_at as organization_created_at,
              s.status,
              s.paid_through,
              coalesce(p.enforcement_enabled, false) as enforcement_enabled
         from organizations o
         left join organization_subscriptions s on s.organization_id = o.id
         left join platform_billing_settings p on p.singleton = true
        where o.id = $1`,
      [organizationId],
    ));
  } catch (erro) {
    if (!erroEhTransitorioDeLeitura(erro)) throw erro;
    throw comoIndisponibilidadeTransitoria(erro);
  }
  const linha = rows[0];
  if (!linha) {
    throw new OrganizacaoComercialInexistenteError(
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
  opcoes: Pick<OpcoesDeAcessoComercial, "aoFalharLeitura"> = {},
): Promise<AccessDecision> {
  return exigirAcessoComercial(organizationId, {
    ...opcoes,
    now,
    leitor: (orgId) => lerProjecaoComercialViaPg(pool, orgId),
  });
}
