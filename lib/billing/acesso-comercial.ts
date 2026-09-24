import { fimDoPeriodoDeTeste } from "@/lib/billing/periodo-de-teste";
import type { SituacaoComercialDaAssinatura } from "@/lib/billing/planos";

const TOLERANCIA_MS = 3 * 24 * 60 * 60 * 1000;

export type AccessDecisionReason =
  | "platform_admin"
  | "enforcement_disabled"
  | "trial_active"
  | "trial_expired"
  | "subscription_active"
  | "grace_period"
  | "subscription_expired"
  | "paused"
  | "legacy_unreviewed";

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

/** Um mês-calendário UTC desde o último pagamento confirmado, com ajuste para o fim do mês. */
export function fimDoPeriodoPago(ultimoPagamentoConfirmadoEm: string): string | null {
  const instante = Date.parse(ultimoPagamentoConfirmadoEm);
  if (!Number.isFinite(instante)) return null;

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

function somarTolerancia(paidThrough: string): string | null {
  const limite = Date.parse(paidThrough) + TOLERANCIA_MS;
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
  if (status === "pausado") {
    return { allowed: false, reason: "paused", accessUntil: null, ...base };
  }

  if (status === "teste") {
    const accessUntil = fimDoPeriodoDeTeste(organizationCreatedAt);
    if (accessUntil && now.getTime() < Date.parse(accessUntil)) {
      return { allowed: true, reason: "trial_active", accessUntil, ...base };
    }
    return enforcementEnabled
      ? { allowed: false, reason: "trial_expired", accessUntil, ...base }
      : { allowed: true, reason: "enforcement_disabled", accessUntil, ...base };
  }

  if (status === "ativo" && !paidThrough) {
    return { allowed: true, reason: "legacy_unreviewed", accessUntil: null, ...base };
  }

  const paidUntil = paidThrough ? Date.parse(paidThrough) : NaN;
  const accessUntil = paidThrough ? somarTolerancia(paidThrough) : null;
  if (Number.isFinite(paidUntil) && now.getTime() < paidUntil) {
    return { allowed: true, reason: "subscription_active", accessUntil, ...base };
  }
  if (accessUntil && now.getTime() < Date.parse(accessUntil)) {
    return { allowed: true, reason: "grace_period", accessUntil, ...base };
  }
  return enforcementEnabled
    ? { allowed: false, reason: "subscription_expired", accessUntil, ...base }
    : { allowed: true, reason: "enforcement_disabled", accessUntil, ...base };
}
