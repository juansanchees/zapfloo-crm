// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CAMINHO_CALLBACK_META_ADS, configuracaoOAuth, montarUrlConsentimento } from "./config";

vi.mock("@/lib/env", () => ({ env: {
  get NEXT_PUBLIC_APP_URL() { return process.env["NEXT_PUBLIC_APP_URL"]; },
} }));

beforeEach(() => {
  vi.stubEnv("META_APP_ID", "123456");
  vi.stubEnv("META_APP_SECRET", "segredo-ficticio-da-suite");
  vi.stubEnv("META_LOGIN_CONFIG_ID", "789012");
  vi.stubEnv("META_GRAPH_VERSION", "");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://produto.example");
  vi.stubEnv("NODE_ENV", "production");
});
afterEach(() => vi.unstubAllEnvs());

describe("configuração do login comercial", () => {
  it("usa IDs da instalação e callback canônico, sem chave ou permissões na autorização", () => {
    const config = configuracaoOAuth()!;
    expect(config.graphVersion).toBe("v22.0");
    expect(config.redirectUri).toBe(`https://produto.example${CAMINHO_CALLBACK_META_ADS}`);
    const url = new URL(montarUrlConsentimento(config, "estado-assinado-ficticio"));
    expect(url.origin).toBe("https://www.facebook.com");
    expect(url.pathname).toBe("/v22.0/dialog/oauth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "123456", config_id: "789012", redirect_uri: config.redirectUri,
      state: "estado-assinado-ficticio", response_type: "code", override_default_response_type: "true",
    });
    expect(url.href).not.toContain(config.appSecret);
    expect(url.searchParams.has("scope")).toBe(false);
  });
  it.each(["META_APP_ID", "META_APP_SECRET", "META_LOGIN_CONFIG_ID", "NEXT_PUBLIC_APP_URL"])("ausência de %s degrada sem lançar", (campo) => {
    vi.stubEnv(campo, "");
    expect(configuracaoOAuth()).toBeNull();
  });
  it.each([
    "http://produto.example", "https://user:senha@produto.example", "https://produto.example/callback",
    "https://produto.example?host=outro.example", "https://produto.example/#fragmento", "não-é-url",
  ])("recusa origem não canônica %s", (origem) => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", origem);
    expect(configuracaoOAuth()).toBeNull();
  });
  it("HTTP local só é permitido fora de produção", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://127.0.0.1:3100");
    expect(configuracaoOAuth()).toBeNull();
    vi.stubEnv("NODE_ENV", "test");
    expect(configuracaoOAuth()?.redirectUri).toBe(`http://127.0.0.1:3100${CAMINHO_CALLBACK_META_ADS}`);
  });
  it.each([["META_APP_ID", "123/outro"], ["META_LOGIN_CONFIG_ID", "nenhuma"], ["META_GRAPH_VERSION", "v22.0/../../outro"]])("recusa configuração malformada %s", (campo, valor) => {
    vi.stubEnv(campo, valor);
    expect(configuracaoOAuth()).toBeNull();
  });
});
