import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizarSiteDoNegocio } from "./url";

afterEach(() => vi.unstubAllEnvs());

describe("site do negócio — entrada opcional e segura", () => {
  it("não bloqueia vazio e acrescenta https a um domínio sem protocolo", () => {
    expect(normalizarSiteDoNegocio("  ")).toEqual({ ok: true, url: null });
    expect(normalizarSiteDoNegocio(" minhaloja.com.br/produtos#precos ")).toEqual({
      ok: true,
      url: "https://minhaloja.com.br/produtos",
    });
  });
  it.each([
    "instagram.com/loja",
    "https://www.instagram.com/loja",
    "m.facebook.com/loja",
    "https://FACEBOOK.com./loja",
  ])("recusa rede social imediatamente: %s", (url) => {
    expect(normalizarSiteDoNegocio(url)).toEqual({ ok: false, motivo: "site_rede_social" });
  });
  it.each([
    "localhost",
    "127.0.0.1",
    "169.254.169.254",
    "10.0.0.1",
    "192.168.0.1",
    "172.17.0.1",
    "https://[::1]",
    "ftp://loja.example",
    "http://2130706433",
    "https://user:senha@loja.example",
  ])("reusa recusa textual de destino inseguro: %s", (url) => {
    expect(normalizarSiteDoNegocio(url).ok).toBe(false);
  });
  it("segue https obrigatório do guard existente em produção", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(normalizarSiteDoNegocio("http://loja.example").ok).toBe(false);
    expect(normalizarSiteDoNegocio("https://loja.example").ok).toBe(true);
  });
});
