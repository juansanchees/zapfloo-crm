// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAXIMO_RESPOSTA_OAUTH_BYTES, TEMPO_LIMITE_OAUTH_MS, trocarEValidarCodigo,
} from "./cliente";
import type { ConfigOAuth } from "./config";

const config: ConfigOAuth = {
  appId: "123456", appSecret: "segredo-ficticio-nunca-real", configId: "789012",
  redirectUri: "https://produto.example/api/v1/ads/meta/oauth/callback", graphVersion: "v22.0",
};
const agora = new Date("2026-09-15T12:00:00.000Z");
const futuro = Math.floor(agora.getTime() / 1000) + 3600;
const codigo = "codigo-ficticio-consumivel";
const tokenInicial = "token-ficticio-curto";
const tokenFinal = "token-ficticio-final";
const dadosValidos = { app_id: config.appId, is_valid: true, type: "SYSTEM_USER",
  expires_at: 0, data_access_expires_at: 0, scopes: ["ads_read"] };
function token(valor = tokenInicial) { return Response.json({ access_token: valor }); }
function inspecao(alteracoes: Record<string, unknown> = {}) { return Response.json({ data: { ...dadosValidos, ...alteracoes } }); }
function fila(...respostas: Response[]) {
  const transporte = vi.fn<typeof fetch>();
  for (const resposta of respostas) transporte.mockResolvedValueOnce(resposta);
  return transporte;
}
function urlDaChamada(transporte: ReturnType<typeof fila>, indice: number) {
  return new URL(String(transporte.mock.calls[indice]![0]));
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("troca e inspeção autoritativa da autorização", () => {
  it("SYSTEM_USER sem vencimento é inspecionado e nunca sofre troca longa", async () => {
    const transporte = fila(token(), inspecao());
    await expect(trocarEValidarCodigo(config, codigo, agora, transporte)).resolves.toEqual({
      ok: true, accessToken: tokenInicial, tokenType: "SYSTEM_USER", tokenExpiresAt: null,
      dataAccessExpiresAt: null, checkedAt: agora.toISOString(),
    });
    expect(transporte).toHaveBeenCalledTimes(2);
    expect(Object.fromEntries(urlDaChamada(transporte, 0).searchParams)).toEqual({
      client_id: config.appId, client_secret: config.appSecret, redirect_uri: config.redirectUri, code: codigo,
    });
    expect(Object.fromEntries(urlDaChamada(transporte, 1).searchParams)).toEqual({ input_token: tokenInicial });
    expect(new Headers(transporte.mock.calls[1]![1]?.headers).get("authorization")).toBe(`Bearer ${config.appId}|${config.appSecret}`);
  });
  it("SYSTEM_USER com vencimento preserva a data real, sem impor validade eterna", async () => {
    const transporte = fila(token(), inspecao({ expires_at: futuro, data_access_expires_at: futuro + 100 }));
    const resposta = await trocarEValidarCodigo(config, codigo, agora, transporte);
    expect(resposta).toMatchObject({ ok: true, tokenType: "SYSTEM_USER",
      tokenExpiresAt: new Date(futuro * 1000).toISOString(), dataAccessExpiresAt: new Date((futuro + 100) * 1000).toISOString() });
    expect(transporte).toHaveBeenCalledTimes(2);
  });
  it("USER faz troca longa uma vez e usa validade do debug final, não 60 dias presumidos", async () => {
    const expiraReal = futuro + 9 * 86400;
    const acessoReal = futuro + 14 * 86400;
    const transporte = fila(token(), inspecao({ type: "USER", expires_at: futuro }), token(tokenFinal),
      inspecao({ type: "USER", expires_at: expiraReal, data_access_expires_at: acessoReal }));
    await expect(trocarEValidarCodigo(config, codigo, agora, transporte)).resolves.toEqual({
      ok: true, accessToken: tokenFinal, tokenType: "USER", checkedAt: agora.toISOString(),
      tokenExpiresAt: new Date(expiraReal * 1000).toISOString(), dataAccessExpiresAt: new Date(acessoReal * 1000).toISOString(),
    });
    expect(transporte).toHaveBeenCalledTimes(4);
    expect(Object.fromEntries(urlDaChamada(transporte, 2).searchParams)).toEqual({
      client_id: config.appId, client_secret: config.appSecret,
      grant_type: "fb_exchange_token", fb_exchange_token: tokenInicial,
    });
    expect(urlDaChamada(transporte, 3).searchParams.get("input_token")).toBe(tokenFinal);
    expect(transporte.mock.calls.filter(([input]) => new URL(String(input)).searchParams.has("code"))).toHaveLength(1);
  });
  it("USER explicitamente sem prazo não recebe uma troca desnecessária", async () => {
    const transporte = fila(token(), inspecao({ type: "USER" }));
    expect(await trocarEValidarCodigo(config, codigo, agora, transporte)).toMatchObject({ ok: true, tokenExpiresAt: null });
    expect(transporte).toHaveBeenCalledTimes(2);
  });
  it.each([
    [{ app_id: "999999" }, "app_incorreto"],
    [{ is_valid: false }, "token_invalido"],
    [{ scopes: ["business_management"] }, "permissao_insuficiente"],
    [{ expires_at: Math.floor(agora.getTime() / 1000) }, "token_expirado"],
    [{ data_access_expires_at: Math.floor(agora.getTime() / 1000) }, "acesso_expirado"],
    [{ type: "APP" }, "resposta_invalida"],
    [{ expires_at: -1 }, "resposta_invalida"],
    [{ expires_at: undefined }, "resposta_invalida"],
    [{ data_access_expires_at: undefined }, "resposta_invalida"],
  ] as const)("rejeita inspeção incompatível %j", async (alteracoes, error) => {
    const transporte = fila(token(), inspecao(alteracoes));
    expect(await trocarEValidarCodigo(config, codigo, agora, transporte)).toEqual({ ok: false, error });
    expect(transporte).toHaveBeenCalledTimes(2);
  });
  it("inspeção final também recusa outro aplicativo", async () => {
    const transporte = fila(token(), inspecao({ type: "USER", expires_at: futuro }), token(tokenFinal),
      inspecao({ type: "USER", expires_at: futuro, app_id: "999999" }));
    expect(await trocarEValidarCodigo(config, codigo, agora, transporte)).toEqual({ ok: false, error: "app_incorreto" });
  });
  it("a troca não pode mudar o tipo de USER para SYSTEM_USER", async () => {
    const transporte = fila(token(), inspecao({ type: "USER", expires_at: futuro }), token(tokenFinal), inspecao());
    expect(await trocarEValidarCodigo(config, codigo, agora, transporte)).toEqual({ ok: false, error: "token_invalido" });
  });
});

describe("limites de transporte e sigilo", () => {
  it("host fixo, sem redirecionar, cachear, credenciais de browser ou métricas do Next", async () => {
    const transporte = fila(token(), inspecao());
    await trocarEValidarCodigo(config, codigo, agora, transporte);
    for (const [input, init] of transporte.mock.calls) {
      expect(new URL(String(input)).origin).toBe("https://graph.facebook.com");
      expect(init).toMatchObject({ method: "GET", redirect: "error", cache: "no-store", credentials: "omit", next: { internal: true } });
      expect(init?.signal).toBeDefined();
    }
  });
  it("erro do provedor não é registrado, propagado ou repetido", async () => {
    const transporte = fila(Response.json({ error: { message: `erro com ${codigo} ${config.appSecret} ${tokenInicial}` } }, { status: 400 }));
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");
    const warn = vi.spyOn(console, "warn");
    expect(await trocarEValidarCodigo(config, codigo, agora, transporte)).toEqual({ ok: false, error: "provedor_recusou" });
    expect(transporte).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled();
  });
  it("erro de rede que contém a URL sensível vira enum seguro e não recebe retry", async () => {
    const transporte = vi.fn<typeof fetch>().mockRejectedValue(new Error(`falhou https://graph.facebook.com/?client_secret=${config.appSecret}&code=${codigo}`));
    expect(await trocarEValidarCodigo(config, codigo, agora, transporte)).toEqual({ ok: false, error: "falha_de_rede" });
    expect(transporte).toHaveBeenCalledTimes(1);
  });
  it("timeout abrange a chamada inteira e não repete o código", async () => {
    vi.useFakeTimers();
    const transporte = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => undefined));
    const resultado = trocarEValidarCodigo(config, codigo, agora, transporte);
    await vi.advanceTimersByTimeAsync(TEMPO_LIMITE_OAUTH_MS);
    expect(await resultado).toEqual({ ok: false, error: "tempo_esgotado" });
    expect(transporte).toHaveBeenCalledTimes(1);
    expect(transporte.mock.calls[0]![1]?.signal?.aborted).toBe(true);
  });
  it("timeout também limita um body que para de chegar", async () => {
    vi.useFakeTimers();
    const transporte = fila(new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("{")); } })));
    const resultado = trocarEValidarCodigo(config, codigo, agora, transporte);
    await vi.advanceTimersByTimeAsync(TEMPO_LIMITE_OAUTH_MS);
    expect(await resultado).toEqual({ ok: false, error: "tempo_esgotado" });
    expect(transporte).toHaveBeenCalledTimes(1);
  });
  it.each([false, true])("resposta grande é rejeitada, Content-Length presente=%s", async (declarado) => {
    const corpo = "x".repeat(MAXIMO_RESPOSTA_OAUTH_BYTES + 1);
    const transporte = fila(new Response(corpo, declarado ? { headers: { "Content-Length": String(corpo.length) } } : undefined));
    expect(await trocarEValidarCodigo(config, codigo, agora, transporte)).toEqual({ ok: false, error: "resposta_invalida" });
    expect(transporte).toHaveBeenCalledTimes(1);
  });
  it.each(["<html>erro</html>", "{}", '{"access_token":""}', "null"])("não presume contrato para %s", async (corpo) => {
    expect(await trocarEValidarCodigo(config, codigo, agora, fila(new Response(corpo)))).toEqual({ ok: false, error: "resposta_invalida" });
  });
  it("configuração adulterada e código vazio não fazem rede", async () => {
    const transporte = vi.fn<typeof fetch>();
    expect(await trocarEValidarCodigo({ ...config, graphVersion: "../outro" }, codigo, agora, transporte)).toEqual({ ok: false, error: "configuracao_invalida" });
    expect(await trocarEValidarCodigo(config, " ", agora, transporte)).toEqual({ ok: false, error: "codigo_invalido" });
    expect(transporte).not.toHaveBeenCalled();
  });
});
