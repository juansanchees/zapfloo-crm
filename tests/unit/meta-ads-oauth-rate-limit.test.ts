// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as ServicoOAuth from "@/lib/plataformas-de-anuncio/meta/oauth/servico";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(), rpc: vi.fn(), iniciar: vi.fn(), lerLink: vi.fn(), usuario: vi.fn(),
  trocar: vi.fn(), guardar: vi.fn(), pagina: vi.fn(), logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://crm.exemplo.invalid" } }));
vi.mock("@/lib/logger", () => ({ logger: mocks.logger }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getUser: mocks.usuario } }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/plataformas-de-anuncio/meta/oauth/config", () => ({ configuracaoOAuth: () => ({ appId: "teste" }) }));
vi.mock("@/lib/plataformas-de-anuncio/meta/oauth/cliente", () => ({ trocarEValidarCodigo: mocks.trocar }));
vi.mock("@/lib/plataformas-de-anuncio/meta/oauth/servico", async (importOriginal) => ({
  ...await importOriginal<typeof ServicoOAuth>(),
  iniciarConexao: mocks.iniciar, lerLinkAutorizado: mocks.lerLink,
  guardarConexaoOAuth: mocks.guardar, lerPaginaDoLink: mocks.pagina,
}));

const ORIGEM = "https://crm.exemplo.invalid";
const TOKEN = "capacidade-sintetica-nao-real-para-limite-publico";
const PEDIDO = "55555555-5555-4555-8555-555555555555";
const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "33333333-3333-4333-8333-333333333333";
const VINCULO = Buffer.alloc(32, 7).toString("base64url");

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-15T15:00:10Z"));
  vi.stubEnv("INTERNAL_SECRET", "segredo-sintetico-oauth-para-teste-nao-real-32");
  mocks.headers.mockResolvedValue(new Headers());
  mocks.rpc.mockResolvedValue({ data: { status: "request_unavailable" }, error: null });
  mocks.lerLink.mockResolvedValue({ id: PEDIDO, organization_id: ORG, user_id: USER });
  mocks.iniciar.mockResolvedValue(null);
  mocks.pagina.mockResolvedValue({ ok: true, nome: "Negócio sintético" });
  mocks.usuario.mockResolvedValue({ data: { user: null }, error: null });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function conferir429(resposta: Response) {
  expect(resposta.status).toBe(429);
  expect(resposta.headers.get("retry-after")).toBe("60");
  expect(resposta.headers.get("cache-control")).toContain("no-store");
  expect(resposta.headers.get("x-request-id")).toBeTruthy();
  expect(resposta.headers.get("location")).toBeNull();
}

describe("entradas públicas OAuth — contador canônico real, sem Redis nem IP", () => {
  it.each(["GET", "HEAD"])("página %s retorna HTTP429 na tentativa21, sem duplicar a contagem no RSC", async (method) => {
    const { proxy } = await import("@/proxy");
    const { default: Pagina } = await import("@/app/ads/connect/[token]/page");
    for (let i = 0; i < 20; i++) {
      const resposta = await proxy(new NextRequest(`${ORIGEM}/ads/connect/${TOKEN}?tentativa=${i}`, { method }));
      expect(resposta.status).toBe(200);
      expect(resposta.headers.get("x-middleware-next")).toBe("1");
      if (method === "GET") await Pagina({ params: Promise.resolve({ token: TOKEN }) });
    }
    const antes = mocks.pagina.mock.calls.length;
    const resposta = await proxy(new NextRequest(`${ORIGEM}/ads/connect/${TOKEN}?tentativa=21`, { method }));
    conferir429(resposta);
    expect(mocks.pagina).toHaveBeenCalledTimes(antes);
    const texto = await resposta.text();
    if (method === "HEAD") expect(texto).toBe("");
    else expect(texto).toContain("Muitas tentativas");
    expect(texto).not.toContain(TOKEN);
  });

  it("callback repete o mesmo state sem IP: tentativa21 é429 e não consome recibo nem chama a rede", async () => {
    const { GET } = await import("@/app/api/v1/ads/meta/oauth/callback/route");
    const { assinarEstado } = await import("@/lib/plataformas-de-anuncio/meta/oauth/estado");
    const { nomeCookie } = await import("@/app/api/v1/ads/meta/oauth/_respostas");
    const state = assinarEstado({ requestId: PEDIDO, organizationId: ORG, userId: USER, expiresAt: Date.now() + 60_000 });
    expect(state).toBeTruthy();
    const criarRequest = () => new NextRequest(`${ORIGEM}/api/v1/ads/meta/oauth/callback?state=${state}&code=nao-real`, {
      headers: { cookie: `${nomeCookie(PEDIDO)}=${VINCULO}` },
    });
    for (let i = 0; i < 20; i++) expect((await GET(criarRequest())).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(20);
    conferir429(await GET(criarRequest()));
    expect(mocks.rpc).toHaveBeenCalledTimes(20);
    expect(mocks.trocar).not.toHaveBeenCalled();
    expect(mocks.guardar).not.toHaveBeenCalled();
    expect((await GET(new NextRequest(`${ORIGEM}/api/v1/ads/meta/oauth/callback?state=outro-state-opaco`))).status).toBe(200);
  });

  it("POSTagency limita por capacidade sem IP: tentativa21 é429 antes de ler ou consumir", async () => {
    const { POST } = await import("@/app/api/v1/ads/meta/oauth/agency/route");
    const request = () => new NextRequest(`${ORIGEM}/api/v1/ads/meta/oauth/agency`, {
      method: "POST", headers: { origin: ORIGEM }, body: `link=${TOKEN}`,
    });
    for (let i = 0; i < 20; i++) expect((await POST(request())).status).toBe(303);
    expect(mocks.lerLink).toHaveBeenCalledTimes(20);
    conferir429(await POST(request()));
    expect(mocks.lerLink).toHaveBeenCalledTimes(20);
    expect(mocks.iniciar).toHaveBeenCalledTimes(20);
  });

  it("POSTagency limita60/min por IP antes até de ler corpo inválido", async () => {
    const { POST } = await import("@/app/api/v1/ads/meta/oauth/agency/route");
    const headers = new Headers({ origin: ORIGEM, "x-forwarded-for": "203.0.113.17" });
    mocks.headers.mockResolvedValue(headers);
    const request = () => new NextRequest(`${ORIGEM}/api/v1/ads/meta/oauth/agency`, { method: "POST", headers, body: "" });
    for (let i = 0; i < 60; i++) expect((await POST(request())).status).toBe(303);
    conferir429(await POST(request()));
    expect(mocks.lerLink).not.toHaveBeenCalled();
    expect(mocks.iniciar).not.toHaveBeenCalled();
  });

  it("matcher protege a capacidade mesmo com sufixo de asset; resultado não gasta a janela do link", async () => {
    const { config, proxy } = await import("@/proxy");
    const { unstable_doesMiddlewareMatch } = await import("next/experimental/testing/server");
    for (const suffix of [".js", ".css", ".png", ""]) {
      const pathname = `/ads/connect/${TOKEN}${suffix}`;
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: `${ORIGEM}${pathname}?rsc=1` })).toBe(true);
    }
    for (let i = 0; i < 65; i++) {
      expect((await proxy(new NextRequest(`${ORIGEM}/ads/connect/result`))).status).toBe(200);
    }
    expect((await proxy(new NextRequest(`${ORIGEM}/ads/connect/${TOKEN}`))).status).toBe(200);
  });

  it.each([
    ["curto", "curto"],
    ["alfabeto inválido codificado", "%40invalido"],
    ["comprimento2049", "a".repeat(2049)],
    ["sufixo de asset", "curto.png"],
    ["slash final", "curto/"],
  ])("página conta %s antes de validar o token e429 não alcança autenticação ou banco", async (_caso, segmento) => {
    const { proxy } = await import("@/proxy");
    const request = () => new NextRequest(`${ORIGEM}/ads/connect/${segmento}`);
    for (let i = 0; i < 20; i++) expect((await proxy(request())).status).not.toBe(429);
    const consultas = mocks.usuario.mock.calls.length;
    conferir429(await proxy(request()));
    expect(mocks.usuario).toHaveBeenCalledTimes(consultas);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.pagina).not.toHaveBeenCalled();
    expect(mocks.trocar).not.toHaveBeenCalled();
  });

  it("percent-encoding e query não abrem outra janela para o mesmo segmento", async () => {
    const { proxy } = await import("@/proxy");
    for (let i = 0; i < 20; i++) {
      expect((await proxy(new NextRequest(`${ORIGEM}/ads/connect/curto`))).status).not.toBe(429);
    }
    conferir429(await proxy(new NextRequest(`${ORIGEM}/ads/connect/%63urto?tentativa=outra`)));
  });

  it("callback sem state/cookie não alcança banco nem cria um balde global que trave outro state", async () => {
    const { GET } = await import("@/app/api/v1/ads/meta/oauth/callback/route");
    for (let i = 0; i < 65; i++) {
      expect((await GET(new NextRequest(`${ORIGEM}/api/v1/ads/meta/oauth/callback`))).status).toBe(200);
    }
    expect((await GET(new NextRequest(`${ORIGEM}/api/v1/ads/meta/oauth/callback?state=outro-state-invalido`))).status).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.trocar).not.toHaveBeenCalled();
  });

  it("callback com state acima do tamanho permitido termina antes do banco e do provedor", async () => {
    const { GET } = await import("@/app/api/v1/ads/meta/oauth/callback/route");
    const resposta = await GET(new NextRequest(`${ORIGEM}/api/v1/ads/meta/oauth/callback?state=${"x".repeat(4097)}`));
    expect(resposta.status).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.trocar).not.toHaveBeenCalled();
    expect(await resposta.text()).not.toContain("x".repeat(4097));
  });

  it("o helper usa headers explícitos e nunca envia IP/state em claro ao contador ou logger", async () => {
    const contador = await import("@/lib/ai/dispatcher/rate-limit");
    const contar = vi.spyOn(contador, "checkRateLimit");
    const { limitarOAuth } = await import("@/lib/plataformas-de-anuncio/meta/oauth/limite");
    const ip = "203.0.113.70";
    mocks.headers.mockRejectedValue(new Error("Proxy não usa headers() do RSC"));
    expect(await limitarOAuth("callback", TOKEN, new Headers({ "x-forwarded-for": ip }))).toBe(false);
    expect(contar).toHaveBeenCalledTimes(2);
    expect(contar.mock.calls.map(([key, limite, janela]) => [key, limite, janela])).toEqual([
      [expect.stringMatching(/^auth:ads_oauth_callback:ip:[a-f0-9]{32}$/), 60, 60],
      [expect.stringMatching(/^auth:ads_oauth_callback:id:[a-f0-9]{32}$/), 20, 60],
    ]);
    const capturado = JSON.stringify([contar.mock.calls, mocks.logger.warn.mock.calls, mocks.logger.error.mock.calls]);
    expect(capturado).not.toContain(TOKEN);
    expect(capturado).not.toContain(ip);
    expect(mocks.headers).not.toHaveBeenCalled();
  });
});
