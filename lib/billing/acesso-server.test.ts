import { describe, expect, it, vi } from "vitest";

// Esta suíte mede o adapter real; o setup global modela uma organização
// liberada apenas para os testes de outros domínios.
vi.unmock("@/lib/billing/acesso-server");

import {
  AcessoComercialBloqueadoError,
  EstadoComercialIndisponivelError,
  avaliarAcessoComercial,
  destinoComercialDoShell,
  exigirAcessoComercial,
  rotaPermitidaDuranteBloqueioComercial,
  serializarBloqueioComercial,
  type LeitorDaProjecaoComercial,
} from "@/lib/billing/acesso-server";

const AGORA = new Date("2026-09-24T12:00:00.000Z");

function leitor(overrides: Partial<Awaited<ReturnType<LeitorDaProjecaoComercial>>> = {}) {
  return vi.fn<LeitorDaProjecaoComercial>(async () => ({
    status: "cancelado",
    organizationCreatedAt: "2026-01-01T00:00:00.000Z",
    paidThrough: "2026-08-01T00:00:00.000Z",
    enforcementEnabled: true,
    isPlatformAdmin: false,
    ...overrides,
  }));
}

describe("adapter server-side da cobrança", () => {
  it("no shell, falha do leitor mantém billing acessível e fecha as demais telas", async () => {
    const leitorComFalha = vi.fn<LeitorDaProjecaoComercial>(async () => {
      throw new EstadoComercialIndisponivelError("banco indisponível");
    });
    await expect(destinoComercialDoShell("org-1", "/app/inbox", { leitor: leitorComFalha }))
      .resolves.toBe("billing");
    await expect(destinoComercialDoShell("org-1", "/app/settings/billing", { leitor: leitorComFalha }))
      .resolves.toBe("permitir");
  });

  it("no shell, bloqueio confirmado também redireciona fora de billing", async () => {
    await expect(destinoComercialDoShell("org-1", "/app", { now: AGORA, leitor: leitor() }))
      .resolves.toBe("billing");
    await expect(destinoComercialDoShell("org-1", "/app/settings/billing", { now: AGORA, leitor: leitor() }))
      .resolves.toBe("permitir");
  });
  it("mantém somente Plano e pagamentos navegável para que a pessoa possa regularizar e sair", () => {
    expect(rotaPermitidaDuranteBloqueioComercial("/app/settings/billing")).toBe(true);
    expect(rotaPermitidaDuranteBloqueioComercial("/app/settings/billing/checkout")).toBe(true);
    expect(rotaPermitidaDuranteBloqueioComercial("/app")).toBe(false);
    expect(rotaPermitidaDuranteBloqueioComercial("/app/inbox")).toBe(false);
  });
  it("usa a decisão única e bloqueia vencido quando o interruptor está ligado", async () => {
    const decisao = await avaliarAcessoComercial("org-1", {
      now: AGORA,
      leitor: leitor(),
    });

    expect(decisao).toMatchObject({
      allowed: false,
      reason: "subscription_expired",
      enforcementEnabled: true,
    });
  });

  it("interruptor desligado libera vencido, mas nunca libera pausado", async () => {
    await expect(avaliarAcessoComercial("org-1", {
      now: AGORA,
      leitor: leitor({ enforcementEnabled: false }),
    })).resolves.toMatchObject({ allowed: true, reason: "enforcement_disabled" });

    await expect(avaliarAcessoComercial("org-1", {
      now: AGORA,
      leitor: leitor({ status: "pausado", enforcementEnabled: false }),
    })).resolves.toMatchObject({ allowed: false, reason: "paused" });
  });

  it("administrador da plataforma passa explicitamente por qualquer estado", async () => {
    await expect(avaliarAcessoComercial("org-1", {
      now: AGORA,
      leitor: leitor({ status: "pausado", isPlatformAdmin: true }),
    })).resolves.toMatchObject({ allowed: true, reason: "platform_admin" });
  });

  it("lança erro tipado antes do sink e serializa detalhes snake_case na API", async () => {
    const executar = exigirAcessoComercial("org-1", {
      now: AGORA,
      leitor: leitor(),
    });

    await expect(executar).rejects.toBeInstanceOf(AcessoComercialBloqueadoError);
    await executar.catch((erro: unknown) => {
      expect(serializarBloqueioComercial(erro as AcessoComercialBloqueadoError)).toEqual({
        reason: "subscription_expired",
        access_until: "2026-08-04T00:00:00.000Z",
        enforcement_enabled: true,
      });
    });
  });
});
