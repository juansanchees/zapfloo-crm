import type pg from "pg";
import { describe, expect, it, vi } from "vitest";

// Esta suíte mede o adapter real; o setup global modela uma organização
// liberada apenas para os testes de outros domínios.
vi.unmock("@/lib/billing/acesso-server");

import {
  AcessoComercialBloqueadoError,
  OrganizacaoComercialInexistenteError,
  EstadoComercialIndisponivelError,
  avaliarAcessoComercial,
  criarAvisadorDeIndisponibilidadeComercial,
  destinoComercialDoShell,
  exigirAcessoComercial,
  exigirAcessoComercialViaPg,
  lerProjecaoComercialViaSupabase,
  recusaComercialDaMutacao,
  rotaPermitidaDuranteBloqueioComercial,
  rotaApiPermitidaDuranteBloqueioComercial,
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

function adminSupabaseComFalha(
  falha: unknown,
  modo: "resposta" | "rejeicao",
) {
  return {
    from(tabela: string) {
      const resposta = tabela === "organizations"
        ? modo === "rejeicao"
          ? Promise.reject(falha)
          : Promise.resolve({ data: null, error: falha })
        : Promise.resolve({ data: null, error: null });
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        maybeSingle: () => resposta,
      };
      return query;
    },
  };
}

describe("adapter server-side da cobrança", () => {
  it("leitura indisponível deixa entrar no shell e registra a falha", async () => {
    const leitorComFalha = vi.fn<LeitorDaProjecaoComercial>(async () => {
      throw new EstadoComercialIndisponivelError("banco indisponível");
    });
    const aoFalharLeitura = vi.fn();
    await expect(destinoComercialDoShell("org-1", "/app/inbox", {
      leitor: leitorComFalha,
      aoFalharLeitura,
    })).resolves.toBe("permitir");
    expect(aoFalharLeitura).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1" }));
  });

  it("interruptor desligado e leitura falhando nunca mandam o cliente para pagamento", async () => {
    const leitorComFalha = vi.fn<LeitorDaProjecaoComercial>(async () => {
      throw new EstadoComercialIndisponivelError("socket hang up");
    });
    await expect(destinoComercialDoShell("org-1", "/app", {
      leitor: leitorComFalha,
      aoFalharLeitura: vi.fn(),
    })).resolves.toBe("permitir");
  });

  it("leitura indisponível libera mutações e workers sem esperar o aviso", async () => {
    const avisoPendente = new Promise<void>(() => undefined);
    const aoFalharLeitura = vi.fn(() => avisoPendente);
    const leitorComFalha = vi.fn<LeitorDaProjecaoComercial>(async () => {
      throw new EstadoComercialIndisponivelError("banco indisponível");
    });
    await expect(recusaComercialDaMutacao("org-1", {
      leitor: leitorComFalha,
      aoFalharLeitura,
    })).resolves.toBeNull();

    const erroDeRede = Object.assign(new Error("conexão reiniciada"), { code: "ECONNRESET" });
    const pool = {
      query: vi.fn().mockRejectedValue(erroDeRede),
    } as unknown as pg.Pool;
    await expect(exigirAcessoComercialViaPg(pool, "org-1", AGORA, { aoFalharLeitura }))
      .resolves.toMatchObject({ allowed: true, reason: "billing_check_unavailable" });
    expect(aoFalharLeitura).toHaveBeenLastCalledWith(expect.objectContaining({
      erro: expect.objectContaining({ sourceCode: "ECONNRESET" }),
    }));
  });

  it.each(["ENOTFOUND", "EAI_AGAIN", "EPIPE"])("falha de rede %s do pg também deixa workers seguirem", async (code) => {
    const erroDeRede = Object.assign(new Error("getaddrinfo indisponível"), { code });
    const pool = { query: vi.fn().mockRejectedValue(erroDeRede) } as unknown as pg.Pool;
    await expect(exigirAcessoComercialViaPg(pool, "org-1", AGORA, {
      aoFalharLeitura: vi.fn(),
    })).resolves.toMatchObject({ allowed: true, reason: "billing_check_unavailable" });
  });

  it("organização inexistente mantém o comportamento anterior sem abrir acesso", async () => {
    const leitorSemOrganizacao = vi.fn<LeitorDaProjecaoComercial>(async () => {
      throw new OrganizacaoComercialInexistenteError("organização inexistente");
    });
    await expect(destinoComercialDoShell("org-ausente", "/app", {
      leitor: leitorSemOrganizacao,
    })).resolves.toBe("billing");

    const resposta = await recusaComercialDaMutacao("org-ausente", {
      leitor: leitorSemOrganizacao,
      requestId: "req-ausente",
    });
    expect(resposta?.status).toBe(503);

    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as pg.Pool;
    await expect(exigirAcessoComercialViaPg(pool, "org-ausente", AGORA, {
      aoFalharLeitura: vi.fn(),
    })).rejects.toBeInstanceOf(OrganizacaoComercialInexistenteError);
  });

  it("bug de programação e erro de entrada não viram bypass comercial", async () => {
    const aoFalharLeitura = vi.fn();
    const leitorComBug = vi.fn<LeitorDaProjecaoComercial>(async () => {
      throw new TypeError("campo inesperado");
    });
    await expect(avaliarAcessoComercial("org-1", { leitor: leitorComBug, aoFalharLeitura }))
      .rejects.toThrow(TypeError);
    expect(aoFalharLeitura).not.toHaveBeenCalled();

    const erroDeEntrada = Object.assign(new Error("invalid input syntax for type uuid"), { code: "22P02" });
    const pool = { query: vi.fn().mockRejectedValue(erroDeEntrada) } as unknown as pg.Pool;
    await expect(exigirAcessoComercialViaPg(pool, "id-invalido", AGORA, { aoFalharLeitura }))
      .rejects.toMatchObject({ code: "22P02" });
    expect(aoFalharLeitura).not.toHaveBeenCalled();
  });

  it.each([
    ["PostgREST sem conexão", { code: "PGRST002", message: "schema cache connection unavailable" }, "resposta"],
    ["fetch de rede", new TypeError("fetch failed"), "rejeicao"],
  ] as const)("normaliza %s no adapter Supabase e preserva o código técnico seguro", async (_caso, falha, modo) => {
    const aoFalharLeitura = vi.fn();
    const admin = adminSupabaseComFalha(falha, modo);
    await expect(avaliarAcessoComercial("org-1", {
      leitor: (organizationId, contexto) => lerProjecaoComercialViaSupabase(
        organizationId,
        contexto,
        admin as never,
      ),
      aoFalharLeitura,
    })).resolves.toMatchObject({ allowed: true, reason: "billing_check_unavailable" });
    expect(aoFalharLeitura).toHaveBeenCalledWith(expect.objectContaining({
      erro: expect.objectContaining({
        sourceCode: "code" in falha ? falha.code : null,
      }),
    }));
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
  it("na API, libera somente endpoint+método exatos; prefixos públicos não viram bypass", () => {
    expect(rotaApiPermitidaDuranteBloqueioComercial("/api/v1/billing/checkout", "POST")).toBe(true);
    expect(rotaApiPermitidaDuranteBloqueioComercial("/api/v1/billing/checkout", "DELETE")).toBe(false);
    expect(rotaApiPermitidaDuranteBloqueioComercial("/api/v1/billing/outro", "POST")).toBe(false);
    expect(rotaApiPermitidaDuranteBloqueioComercial("/api/v1/webhooks/admin", "POST")).toBe(false);
    expect(rotaApiPermitidaDuranteBloqueioComercial("/api/v1/monetizze/admin", "POST")).toBe(false);
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

  it("mutação da marca da instalação preserva o bypass explícito do platform admin", async () => {
    await expect(recusaComercialDaMutacao(null, { isPlatformAdmin: true, requestId: "req" }))
      .resolves.toBeNull();
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

describe("aviso da verificação comercial indisponível", () => {
  it("dez falhas seguidas geram dez logs, um incidente e um evento no Sentry", async () => {
    const logar = vi.fn();
    const registrarIncidente = vi.fn(async () => undefined);
    const capturarNoSentry = vi.fn(async () => undefined);
    const avisar = criarAvisadorDeIndisponibilidadeComercial({
      agoraEmMs: () => 1_000,
      intervaloMs: 5 * 60_000,
      logar,
      registrarIncidente,
      capturarNoSentry,
    });

    for (let i = 0; i < 10; i += 1) {
      avisar({
        organizationId: `org-${i}`,
        erro: new EstadoComercialIndisponivelError("banco indisponível", "PGRST002"),
      });
    }

    expect(logar).toHaveBeenCalledTimes(10);
    expect(logar).toHaveBeenCalledWith(
      "billing: verificação comercial indisponível; acesso mantido",
      expect.objectContaining({ error_code: "PGRST002" }),
    );
    await vi.waitFor(() => {
      expect(registrarIncidente).toHaveBeenCalledTimes(1);
      expect(capturarNoSentry).toHaveBeenCalledTimes(1);
    });
  });

  it("a trava expira e uma falha posterior volta a avisar mesmo se a primeira gravação falhou", async () => {
    let agora = 10_000;
    const registrarIncidente = vi.fn()
      .mockRejectedValueOnce(new Error("incidents indisponível"))
      .mockResolvedValue(undefined);
    const capturarNoSentry = vi.fn(async () => undefined);
    const avisar = criarAvisadorDeIndisponibilidadeComercial({
      agoraEmMs: () => agora,
      intervaloMs: 5 * 60_000,
      logar: vi.fn(),
      registrarIncidente,
      capturarNoSentry,
    });

    avisar({ organizationId: "org-1", erro: new Error("primeira") });
    await vi.waitFor(() => expect(registrarIncidente).toHaveBeenCalledTimes(1));
    agora += 4 * 60_000;
    avisar({ organizationId: "org-1", erro: new Error("ainda dentro da janela") });
    expect(registrarIncidente).toHaveBeenCalledTimes(1);

    agora += 61_000;
    avisar({ organizationId: "org-1", erro: new Error("janela expirada") });
    await vi.waitFor(() => {
      expect(registrarIncidente).toHaveBeenCalledTimes(2);
      expect(capturarNoSentry).toHaveBeenCalledTimes(2);
    });
  });
});
