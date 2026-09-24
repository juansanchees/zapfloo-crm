import { describe, expect, it } from "vitest";

import { decidirAcessoComercial, fimDoPeriodoPago } from "@/lib/billing/acesso-comercial";
import type { SituacaoComercialDaAssinatura } from "@/lib/billing/planos";

const CADASTRO = "2026-09-14T12:00:00.000Z";
const FIM_PAGO = "2026-10-14T12:00:00.000Z";

function decidir(
  status: SituacaoComercialDaAssinatura,
  now: string,
  changes: Partial<Parameters<typeof decidirAcessoComercial>[0]> = {},
) {
  return decidirAcessoComercial({
    status,
    organizationCreatedAt: CADASTRO,
    paidThrough: FIM_PAGO,
    enforcementEnabled: true,
    isPlatformAdmin: false,
    now: new Date(now),
    ...changes,
  });
}

describe("decisão comercial única", () => {
  it("libera o teste até sete dias corridos e bloqueia no instante do vencimento", () => {
    expect(decidir("teste", "2026-09-21T11:59:59.999Z")).toEqual({
      allowed: true,
      reason: "trial_active",
      accessUntil: "2026-09-21T12:00:00.000Z",
      enforcementEnabled: true,
    });
    expect(decidir("teste", "2026-09-21T12:00:00.000Z")).toEqual({
      allowed: false,
      reason: "trial_expired",
      accessUntil: "2026-09-21T12:00:00.000Z",
      enforcementEnabled: true,
    });
  });

  it.each(["ativo", "recusado", "cancelado"] as const)(
    "%s conserva o período pago e os três dias de tolerância",
    (status) => {
      expect(decidir(status, "2026-10-14T11:59:59.999Z")).toEqual({
        allowed: true,
        reason: "subscription_active",
        accessUntil: "2026-10-17T12:00:00.000Z",
        enforcementEnabled: true,
      });
      expect(decidir(status, "2026-10-17T11:59:59.999Z")).toEqual({
        allowed: true,
        reason: "grace_period",
        accessUntil: "2026-10-17T12:00:00.000Z",
        enforcementEnabled: true,
      });
      expect(decidir(status, "2026-10-17T12:00:00.000Z")).toEqual({
        allowed: false,
        reason: "subscription_expired",
        accessUntil: "2026-10-17T12:00:00.000Z",
        enforcementEnabled: true,
      });
    },
  );

  it("desliga apenas o bloqueio de vencidos e informa o prazo original", () => {
    expect(decidir("cancelado", "2026-10-18T12:00:00.000Z", { enforcementEnabled: false })).toEqual({
      allowed: true,
      reason: "enforcement_disabled",
      accessUntil: "2026-10-17T12:00:00.000Z",
      enforcementEnabled: false,
    });
    expect(decidir("teste", "2026-09-22T12:00:00.000Z", { enforcementEnabled: false })).toMatchObject({
      allowed: true,
      reason: "enforcement_disabled",
    });
  });

  it("pausado bloqueia até com o interruptor desligado", () => {
    expect(decidir("pausado", "2026-09-18T12:00:00.000Z", { enforcementEnabled: false })).toEqual({
      allowed: false,
      reason: "paused",
      accessUntil: null,
      enforcementEnabled: false,
    });
  });

  it("administrador da plataforma passa inclusive por pausado", () => {
    expect(decidir("pausado", "2026-10-18T12:00:00.000Z", { isPlatformAdmin: true })).toEqual({
      allowed: true,
      reason: "platform_admin",
      accessUntil: null,
      enforcementEnabled: true,
    });
  });

  it("mantém ativo legado sem datas liberado e identificável para revisão", () => {
    expect(decidir("ativo", "2026-12-18T12:00:00.000Z", { paidThrough: null })).toEqual({
      allowed: true,
      reason: "legacy_unreviewed",
      accessUntil: null,
      enforcementEnabled: true,
    });
  });

  it("não concede prazo inventado a recusado ou cancelado sem pagamento", () => {
    for (const status of ["recusado", "cancelado"] as const) {
      expect(decidir(status, "2026-10-18T12:00:00.000Z", { paidThrough: null })).toEqual({
        allowed: false,
        reason: "subscription_expired",
        accessUntil: null,
        enforcementEnabled: true,
      });
    }
  });
});

describe("período mensal pago", () => {
  it.each([
    ["2026-01-31T23:45:00.000Z", "2026-02-28T23:45:00.000Z"],
    ["2028-01-31T23:45:00.000Z", "2028-02-29T23:45:00.000Z"],
    ["2026-08-31T23:45:00.000Z", "2026-09-30T23:45:00.000Z"],
  ])("avança um mês-calendário UTC de %s até %s", (pagamento, esperado) => {
    expect(fimDoPeriodoPago(pagamento)).toBe(esperado);
  });
});
