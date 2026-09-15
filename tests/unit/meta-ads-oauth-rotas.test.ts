// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  requireRole: vi.fn(), mfa: vi.fn(), config: vi.fn(), limitar: vi.fn(),
  iniciar: vi.fn(), criarLink: vi.fn(), lerLink: vi.fn(), guardar: vi.fn(),
  trocar: vi.fn(), rpc: vi.fn(), audit: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://crm.exemplo.invalid" } }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: mock.requireRole }));
vi.mock("@/lib/auth/server", () => ({ mfaEmDivida: mock.mfa }));
vi.mock("@/lib/audit", () => ({ audit: mock.audit }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mock.rpc }) }));
vi.mock("@/lib/plataformas-de-anuncio/meta/oauth/config", () => ({ configuracaoOAuth: mock.config }));
vi.mock("@/lib/plataformas-de-anuncio/meta/oauth/cliente", () => ({ trocarEValidarCodigo: mock.trocar }));
vi.mock("@/lib/plataformas-de-anuncio/meta/oauth/servico", () => ({
  limitarOAuth: mock.limitar, iniciarConexao: mock.iniciar, criarLinkDeConexao: mock.criarLink,
  lerLinkAutorizado: mock.lerLink, guardarConexaoOAuth: mock.guardar,
}));

import { GET as callback } from "@/app/api/v1/ads/meta/oauth/callback/route";
import { POST as conectar } from "@/app/api/v1/ads/meta/oauth/connect/route";
import { POST as links } from "@/app/api/v1/ads/meta/oauth/links/route";
import { POST as agencia } from "@/app/api/v1/ads/meta/oauth/agency/route";
import { nomeCookie } from "@/app/api/v1/ads/meta/oauth/_respostas";
import { assinarEstado, hashVinculoNavegador } from "@/lib/plataformas-de-anuncio/meta/oauth/estado";
import { isPublicPath } from "@/lib/auth/public-paths";

const ORIGEM = "https://crm.exemplo.invalid";
const ORG = "11111111-1111-4111-8111-111111111111";
const OUTRA_ORG = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const OUTRO_USER = "44444444-4444-4444-8444-444444444444";
const PEDIDO = "55555555-5555-4555-8555-555555555555";
const LINK = "66666666-6666-4666-8666-666666666666";
const VINCULO = Buffer.alloc(32, 7).toString("base64url");
const TOKEN = "token-sintetico-exclusivo-da-prova-oauth-nao-real";
const CODIGO = "codigo-sintetico-exclusivo-da-prova-oauth";

function post(caminho: string, body = "", origin: string | null = ORIGEM) {
  return new NextRequest(`${ORIGEM}/api/v1/ads/meta/oauth/${caminho}`, {
    method: "POST", body,
    headers: { ...(origin ? { origin } : {}), "content-type": "application/x-www-form-urlencoded" },
  });
}

function state(organizationId = ORG, expiresAt = Date.now() + 9 * 60_000) {
  const assinado = assinarEstado({ requestId: PEDIDO, organizationId, userId: USER, expiresAt });
  if (!assinado) throw new Error("A fixture precisa de state real válido");
  return assinado;
}

function retorno(opcoes: { state?: string; vinculo?: string | null; error?: string; semCode?: boolean } = {}) {
  const url = new URL(`${ORIGEM}/api/v1/ads/meta/oauth/callback`);
  url.searchParams.set("state", opcoes.state ?? state());
  if (!opcoes.semCode) url.searchParams.set("code", CODIGO);
  if (opcoes.error) url.searchParams.set("error", opcoes.error);
  const vinculo = opcoes.vinculo === undefined ? VINCULO : opcoes.vinculo;
  return new NextRequest(url, { headers: vinculo ? { cookie: `${nomeCookie(PEDIDO)}=${vinculo}` } : {} });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-15T15:00:00Z"));
  vi.stubEnv("INTERNAL_SECRET", "segredo-sintetico-oauth-hmac-de-teste-com-mais-de-32");
  mock.requireRole.mockResolvedValue({ ok: true, user: { id: USER }, org: { orgId: ORG, role: "manager" } });
  mock.mfa.mockResolvedValue(false);
  mock.config.mockReturnValue({ appId: "123456", appSecret: "app-secret-sintetico", configId: "987654", redirectUri: `${ORIGEM}/api/v1/ads/meta/oauth/callback`, graphVersion: "v22.0" });
  mock.limitar.mockResolvedValue(false);
  mock.iniciar.mockResolvedValue({ url: "https://www.facebook.com/v22.0/dialog/oauth?state=fixture", vinculo: VINCULO, requestId: PEDIDO });
  mock.criarLink.mockResolvedValue({ url: `${ORIGEM}/ads/connect/link-assinado`, expires_at: "2026-09-15T15:30:00Z" });
  mock.lerLink.mockResolvedValue({ id: LINK, organization_id: ORG, user_id: USER });
  mock.rpc.mockImplementation(async (_nome, args) => ({
    data: args.p_organization_id === ORG && args.p_request_id === PEDIDO && args.p_browser_digest === hashVinculoNavegador(VINCULO)
      ? { status: "ok", user_id: USER, origin: "agency" }
      : { status: "request_unavailable" },
    error: null,
  }));
  mock.trocar.mockResolvedValue({ ok: true, accessToken: TOKEN, tokenType: "USER", tokenExpiresAt: "2026-10-01T00:00:00Z", dataAccessExpiresAt: null, checkedAt: "2026-09-15T15:00:00Z" });
  mock.guardar.mockResolvedValue(true);
  mock.audit.mockResolvedValue(undefined);
});

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("OAuth de anúncios — callbacks com assinatura real", () => {
  it("SABOTAGEM assinatura: state adulterado não alcança banco, provedor ou persistência", async () => {
    const valido = state();
    const alterado = valido.slice(0, -1) + (valido.endsWith("0") ? "1" : "0");
    const resposta = await callback(retorno({ state: alterado }));
    expect(await resposta.text()).toContain("status=erro");
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.trocar).not.toHaveBeenCalled();
    expect(mock.guardar).not.toHaveBeenCalled();
  });

  it("SABOTAGEM cookie: sem vínculo não consome banco nem troca código", async () => {
    await callback(retorno({ vinculo: null }));
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.trocar).not.toHaveBeenCalled();
  });

  it("cookie duplicado ou malformado não abre autoridade", async () => {
    const duplicada = retorno();
    vi.spyOn(duplicada.cookies, "getAll").mockReturnValue([
      { name: nomeCookie(PEDIDO), value: VINCULO }, { name: nomeCookie(PEDIDO), value: VINCULO },
    ]);
    await callback(duplicada);
    await callback(retorno({ vinculo: "curto" }));
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.trocar).not.toHaveBeenCalled();
  });

  it("assinatura válida para outra organização ou navegador não vence o recibo do banco", async () => {
    await callback(retorno({ state: state(OUTRA_ORG) }));
    await callback(retorno({ vinculo: Buffer.alloc(32, 8).toString("base64url") }));
    expect(mock.rpc).toHaveBeenNthCalledWith(1, "fn_ad_insights_oauth_consumir", expect.objectContaining({ p_organization_id: OUTRA_ORG }));
    expect(mock.trocar).not.toHaveBeenCalled();
    expect(mock.guardar).not.toHaveBeenCalled();
  });

  it("state realmente vencido é recusado antes do banco", async () => {
    const valido = state(ORG, Date.now() + 1_000);
    vi.advanceTimersByTime(1_001);
    await callback(retorno({ state: valido }));
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.trocar).not.toHaveBeenCalled();
  });

  it.each([
    ["replay", { data: { status: "request_unavailable" }, error: null }],
    ["banco indisponível", { data: null, error: { message: "banco de teste indisponível" } }],
    ["nenhum recibo", { data: null, error: null }],
    ["ator divergente", { data: { status: "ok", user_id: OUTRO_USER, origin: "agency" }, error: null }],
  ] as const)("SABOTAGEM consumo: %s não chama provedor", async (_caso, resultado) => {
    mock.rpc.mockResolvedValue(resultado);
    const resposta = await callback(retorno());
    expect(await resposta.text()).toContain("status=erro");
    expect(mock.trocar).not.toHaveBeenCalled();
    expect(mock.guardar).not.toHaveBeenCalled();
  });

  it("cancelamento consome a tentativa e registra desfecho sem chamar o provedor", async () => {
    const resposta = await callback(retorno({ error: "access_denied" }));
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    expect(mock.trocar).not.toHaveBeenCalled();
    expect(mock.guardar).not.toHaveBeenCalled();
    expect(mock.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "ad_insights_oauth.cancelled" }));
    expect(await resposta.text()).toContain("status=cancelado");
  });

  it("sucesso consome uma vez, guarda o token e termina com ponte 200 sem segredo", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const resposta = await callback(retorno());
    const html = await resposta.text();
    expect(resposta.status).toBe(200);
    expect(html).toContain("/ads/connect/result?status=conectado");
    expect(resposta.headers.get("location")).toBeNull();
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("fn_ad_insights_oauth_consumir", {
      p_organization_id: ORG, p_request_id: PEDIDO, p_browser_digest: hashVinculoNavegador(VINCULO),
    });
    expect(mock.rpc.mock.invocationCallOrder[0]).toBeLessThan(mock.trocar.mock.invocationCallOrder[0]!);
    expect(mock.guardar).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORG, requestId: PEDIDO, accessToken: TOKEN }));
    expect(resposta.headers.get("cache-control")).toContain("no-store");
    expect(resposta.headers.get("referrer-policy")).toBe("no-referrer");
    expect(resposta.headers.get("set-cookie")).toContain(`${nomeCookie(PEDIDO)}=;`);
    expect(resposta.headers.get("set-cookie")).toContain("Max-Age=0");
    for (const secreto of [TOKEN, CODIGO, VINCULO, state()]) {
      expect(html).not.toContain(secreto);
      expect(JSON.stringify(mock.audit.mock.calls)).not.toContain(secreto);
      expect(JSON.stringify(log.mock.calls)).not.toContain(secreto);
    }
  });

  it.each(["provedor", "gravação", "configuração", "code"])("falha de %s não vira conexão concluída", async (causa) => {
    if (causa === "provedor") mock.trocar.mockResolvedValue({ ok: false, error: "provedor_recusou" });
    if (causa === "gravação") mock.guardar.mockResolvedValue(false);
    if (causa === "configuração") mock.config.mockReturnValue(null);
    const resposta = await callback(retorno({ semCode: causa === "code" }));
    expect(await resposta.text()).toContain("status=erro");
    if (causa !== "gravação") expect(mock.guardar).not.toHaveBeenCalled();
    expect(mock.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "ad_insights_oauth.failed" }));
  });
});

describe("OAuth de anúncios — entrada autenticada e agência", () => {
  it.each([conectar, links])("origem, manager e MFA são exigidos na entrada autenticada", async (rota) => {
    expect((await rota(post("connect", "", "https://outro.invalid"))).status).toBe(403);
    expect(mock.requireRole).not.toHaveBeenCalled();
    mock.requireRole.mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await rota(post("connect"))).status).toBe(403);
    expect(mock.requireRole).toHaveBeenCalledWith("manager", expect.objectContaining({ allowPlatformAdmin: true }));
    mock.mfa.mockResolvedValueOnce(true);
    expect((await rota(post("connect"))).status).toBe(403);
    expect(mock.iniciar).not.toHaveBeenCalled();
    expect(mock.criarLink).not.toHaveBeenCalled();
  });

  it("começo direto usa só org/ator autenticados e cookie Host/Lax específico por solicitação", async () => {
    const resposta = await conectar(post("connect", `organization_id=${OUTRA_ORG}&user_id=${OUTRO_USER}`));
    expect(resposta.status).toBe(303);
    expect(mock.iniciar).toHaveBeenCalledWith(ORG, USER);
    const cookie = resposta.headers.get("set-cookie")!;
    for (const atributo of [`__Host-ads_oauth_bind_${PEDIDO}=`, "HttpOnly", "Secure", "SameSite=lax", "Path=/", "Max-Age=600"]) expect(cookie).toContain(atributo);
    expect(cookie).not.toContain("Domain=");
    expect(nomeCookie(LINK)).not.toBe(nomeCookie(PEDIDO));
  });

  it("emite link só pelo escopo autenticado, com resposta privada", async () => {
    const resposta = await links(post("links", `organization_id=${OUTRA_ORG}`));
    expect(resposta.status).toBe(201);
    expect(mock.criarLink).toHaveBeenCalledExactlyOnceWith(ORG, USER);
    expect(resposta.headers.get("cache-control")).toContain("no-store");
    expect(await resposta.json()).toEqual({ data: expect.objectContaining({ url: `${ORIGEM}/ads/connect/link-assinado` }) });
  });

  it("agência rejeita origem externa, link ausente/inválido e corpo grande", async () => {
    expect((await agencia(post("agency", "link=algum", "https://outro.invalid"))).status).toBe(403);
    await agencia(post("agency", ""));
    await agencia(post("agency", "link=" + "x".repeat(8193)));
    expect(mock.lerLink).not.toHaveBeenCalled();
    mock.lerLink.mockResolvedValue(null);
    const resposta = await agencia(post("agency", "link=invalido"));
    expect(resposta.headers.get("location")).toBe(`${ORIGEM}/ads/connect/result?status=erro`);
    expect(mock.iniciar).not.toHaveBeenCalled();
  });

  it("agência usa o recibo autorizado e uma segunda reivindicação recusada não sai para o Facebook", async () => {
    const body = `link=link-assinado&organization_id=${OUTRA_ORG}&user_id=${OUTRO_USER}`;
    const primeira = await agencia(post("agency", body));
    expect(primeira.status).toBe(303);
    expect(mock.iniciar).toHaveBeenCalledExactlyOnceWith(ORG, USER, LINK);
    mock.iniciar.mockResolvedValueOnce(null);
    const segunda = await agencia(post("agency", body));
    expect(segunda.headers.get("location")).toBe(`${ORIGEM}/ads/connect/result?status=erro`);
    expect(segunda.headers.get("set-cookie")).toBeNull();
  });

  it("limite de abuso bloqueia sem iniciar autoridade", async () => {
    mock.limitar.mockResolvedValue(true);
    expect((await conectar(post("connect"))).status).toBe(429);
    expect((await links(post("links"))).status).toBe(429);
    expect((await agencia(post("agency", "link=teste"))).status).toBe(429);
    expect(mock.iniciar).not.toHaveBeenCalled();
    expect(mock.criarLink).not.toHaveBeenCalled();
    expect(mock.lerLink).not.toHaveBeenCalled();
  });

  it("só callback/agency e páginas de capacidade são públicos; nenhum prefixo abre APIs futuras", () => {
    for (const rota of ["callback", "agency"]) expect(isPublicPath(`/api/v1/ads/meta/oauth/${rota}`)).toBe(true);
    for (const rota of ["connect", "links", "link", "callback/extra", "agency/extra", "qualquer"]) expect(isPublicPath(`/api/v1/ads/meta/oauth/${rota}`)).toBe(false);
    expect(isPublicPath(`/ads/connect/${state()}`)).toBe(true);
    expect(isPublicPath("/ads/connect/result")).toBe(true);
    expect(isPublicPath("/ads/connect/result/extra")).toBe(false);
    expect(isPublicPath("/ads/connect/" + "a".repeat(2049))).toBe(false);
  });
});
