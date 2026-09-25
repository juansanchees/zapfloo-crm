import { fimDoPeriodoDeTeste } from "@/lib/billing/periodo-de-teste";
import type { SituacaoComercialDaAssinatura } from "@/lib/billing/planos";

const TOLERANCIA_MS = 3 * 24 * 60 * 60 * 1000;

export type AccessDecisionReason =
  | "platform_admin"
  | "enforcement_disabled"
  | "billing_check_unavailable"
  | "trial_active"
  | "trial_expired"
  | "subscription_active"
  | "grace_period"
  | "subscription_expired"
  | "paused"
  | "legacy_unreviewed"
  | "invalid_billing_data"
  | "unknown_status";

export type AccessDecision = {
  allowed: boolean;
  reason: AccessDecisionReason;
  accessUntil: string | null;
  enforcementEnabled: boolean;
};

export type AccessDecisionInput = {
  status: SituacaoComercialDaAssinatura;
  organizationCreatedAt: string | null;
  paidThrough: string | null;
  enforcementEnabled: boolean;
  isPlatformAdmin: boolean;
  now: Date;
};

/** Lê somente instantes RFC3339 com fuso explícito; Date.parse normaliza datas civis impossíveis. */
function instanteRfc3339(valor: string): number | null {
  if (typeof valor !== "string") return null;
  const partes = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|([+-])(\d{2}):(\d{2}))$/i.exec(valor);
  if (!partes) return null;

  const [, anoTexto, mesTexto, diaTexto, horaTexto, minutoTexto, segundoTexto, fracao, , sinal, fusoHoraTexto, fusoMinutoTexto] = partes;
  const ano = Number(anoTexto);
  const mes = Number(mesTexto);
  const dia = Number(diaTexto);
  const hora = Number(horaTexto);
  const minuto = Number(minutoTexto);
  const segundo = Number(segundoTexto);
  const fusoHora = fusoHoraTexto ? Number(fusoHoraTexto) : 0;
  const fusoMinuto = fusoMinutoTexto ? Number(fusoMinutoTexto) : 0;
  const bissexto = ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0);
  const diasDoMes = [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (mes < 1 || mes > 12 || dia < 1 || dia > (diasDoMes[mes - 1] ?? 0) ||
      hora > 23 || minuto > 59 || segundo > 59 || fusoHora > 23 || fusoMinuto > 59) {
    return null;
  }

  const local = new Date(0);
  local.setUTCFullYear(ano, mes - 1, dia);
  local.setUTCHours(hora, minuto, segundo, Number((fracao ?? "").padEnd(3, "0").slice(0, 3)));
  const deslocamento = (fusoHora * 60 + fusoMinuto) * 60_000 * (sinal === "-" ? -1 : 1);
  const instante = local.getTime() - deslocamento;
  return Number.isFinite(instante) && Math.abs(instante) <= 8.64e15 ? instante : null;
}

/** Um mês-calendário UTC desde o último pagamento confirmado, com ajuste para o fim do mês. */
export function fimDoPeriodoPago(ultimoPagamentoConfirmadoEm: string): string | null {
  const instante = instanteRfc3339(ultimoPagamentoConfirmadoEm);
  if (instante === null) return null;

  const pagamento = new Date(instante);
  const fim = new Date(instante);
  const diaOriginal = pagamento.getUTCDate();
  fim.setUTCDate(1);
  fim.setUTCMonth(fim.getUTCMonth() + 1);
  const ultimoDiaDoMes = new Date(0);
  ultimoDiaDoMes.setUTCFullYear(fim.getUTCFullYear(), fim.getUTCMonth() + 1, 0);
  fim.setUTCDate(Math.min(diaOriginal, ultimoDiaDoMes.getUTCDate()));
  return Number.isFinite(fim.getTime()) ? fim.toISOString() : null;
}

function somarTolerancia(paidThrough: number): string | null {
  const limite = paidThrough + TOLERANCIA_MS;
  return Number.isFinite(limite) && Math.abs(limite) <= 8.64e15
    ? new Date(limite).toISOString()
    : null;
}

/** Mesma decisão para a interface, APIs e workers; sem banco ou relógio implícito. */
export function decidirAcessoComercial(entrada: AccessDecisionInput): AccessDecision {
  const { status, organizationCreatedAt, paidThrough, enforcementEnabled, isPlatformAdmin, now } = entrada;
  const base = { enforcementEnabled };

  if (isPlatformAdmin) {
    return { allowed: true, reason: "platform_admin", accessUntil: null, ...base };
  }
  if (status !== "teste" && status !== "ativo" && status !== "recusado" &&
      status !== "cancelado" && status !== "pausado") {
    return { allowed: false, reason: "unknown_status", accessUntil: null, ...base };
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    return { allowed: false, reason: "invalid_billing_data", accessUntil: null, ...base };
  }
  if (status === "pausado") {
    return { allowed: false, reason: "paused", accessUntil: null, ...base };
  }

  const cadastro = organizationCreatedAt === null ? null : instanteRfc3339(organizationCreatedAt);
  const paidUntil = paidThrough === null ? null : instanteRfc3339(paidThrough);
  if (cadastro === null || (paidThrough !== null && paidUntil === null)) {
    return { allowed: false, reason: "invalid_billing_data", accessUntil: null, ...base };
  }

  if (status === "teste") {
    const accessUntil = fimDoPeriodoDeTeste(new Date(cadastro).toISOString());
    if (accessUntil && now.getTime() < Date.parse(accessUntil)) {
      return { allowed: true, reason: "trial_active", accessUntil, ...base };
    }
    return enforcementEnabled
      ? { allowed: false, reason: "trial_expired", accessUntil, ...base }
      : { allowed: true, reason: "enforcement_disabled", accessUntil, ...base };
  }

  if (status === "ativo" && paidThrough === null) {
    return { allowed: true, reason: "legacy_unreviewed", accessUntil: null, ...base };
  }

  const accessUntil = paidUntil !== null ? somarTolerancia(paidUntil) : null;
  if (paidUntil !== null && now.getTime() < paidUntil) {
    return { allowed: true, reason: "subscription_active", accessUntil, ...base };
  }
  if (accessUntil && now.getTime() < Date.parse(accessUntil)) {
    return { allowed: true, reason: "grace_period", accessUntil, ...base };
  }
  return enforcementEnabled
    ? { allowed: false, reason: "subscription_expired", accessUntil, ...base }
    : { allowed: true, reason: "enforcement_disabled", accessUntil, ...base };
}
