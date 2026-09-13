// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lookup = vi.hoisted(() => vi.fn());
vi.mock("node:dns/promises", () => ({ lookup }));

import { lerSite, LIMITES_LEITURA_SITE } from "./leitura";

const html = (
  texto = "Somos a loja do bairro. Vendemos alimentos para cães e gatos com atendimento acolhedor.",
) =>
  new Response(`<html><body><main>${texto}</main></body></html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  lookup.mockReset().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("leitor de site limitado e com os dois guards reais", () => {
  it("lê home e página útil da mesma origem, com a proteção DNS antes de cada fetch", async () => {
    const ordem: string[] = [];
    lookup.mockImplementation(async () => {
      ordem.push("dns");
      return [{ address: "93.184.216.34", family: 4 }];
    });
    fetchMock.mockImplementation(async (url: string) => {
      ordem.push("fetch");
      return url.endsWith("/sobre")
        ? html("Atendemos desde 2010 e somos especializados no cuidado dos animais da família.")
        : html(
            `Somos uma loja de produtos para animais, conheça nossa história. <a href="/sobre">Sobre</a><a href="https://outro.example/produtos">Produtos fora</a>`,
          );
    });
    const resultado = await lerSite("loja.example");
    expect(resultado).toMatchObject({ status: "success", paginasLidas: 2, limiteAtingido: false });
    expect(ordem).toEqual(["dns", "fetch", "dns", "fetch"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://loja.example/",
      expect.objectContaining({ redirect: "manual", credentials: "omit" }),
    );
  });
  it.each([
    "localhost",
    "https://169.254.169.254",
    "https://192.168.0.5",
    "https://instagram.com/loja",
  ])("nem resolve/faz HTTP para endereço recusado: %s", async (url) => {
    expect((await lerSite(url)).status).toBe("failed");
    expect(lookup).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("DNS público que aponta à rede privada é recusado pelo guard já existente", async () => {
    lookup.mockResolvedValue([{ address: "93.184.216.34" }, { address: "169.254.169.254" }]);
    expect(await lerSite("https://loja.example")).toMatchObject({
      status: "failed",
      motivo: "site_destino_inseguro",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("revalida endereço textual de redirect sem seguir o destino interno", async () => {
    fetchMock.mockResolvedValue(
      new Response(null, { status: 302, headers: { Location: "https://169.254.169.254/latest" } }),
    );
    expect((await lerSite("https://loja.example")).status).toBe("failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("revalida DNS de redirect, inclusive no mesmo hostname", async () => {
    lookup
      .mockResolvedValueOnce([{ address: "93.184.216.34" }])
      .mockResolvedValueOnce([{ address: "10.0.0.10" }]);
    fetchMock.mockResolvedValue(
      new Response(null, { status: 302, headers: { Location: "/sobre" } }),
    );
    expect(await lerSite("https://loja.example")).toMatchObject({
      status: "failed",
      motivo: "site_destino_inseguro",
    });
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("para no teto mesmo em site grande e contabiliza a tentativa que falhou", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/produtos/1")) throw new Error("offline");
      return html(
        `Produtos e serviços para todos os animais, com carinho. ${Array.from({ length: 2_000 }, (_, i) => `<a href="/produtos/${i}">Produto ${i}</a>`).join("")}`,
      );
    });
    const resultado = await lerSite("https://loja.example");
    expect(resultado).toMatchObject({
      status: "partial",
      limiteAtingido: true,
      paginasLidas: LIMITES_LEITURA_SITE.paginas - 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(LIMITES_LEITURA_SITE.paginas);
  });
  it("redirecionamentos têm teto próprio e contam no teto global", async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: `/produtos/${fetchMock.mock.calls.length}` },
        }),
    );
    expect(await lerSite("https://loja.example")).toMatchObject({
      status: "failed",
      limiteAtingido: true,
      motivo: "site_limite_de_redirecionamentos",
    });
    expect(fetchMock).toHaveBeenCalledTimes(LIMITES_LEITURA_SITE.redirecionamentos + 1);
  });
  it("site fora do ar termina com falha clara e nenhuma retentativa automática", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET private internal detail"));
    expect(await lerSite("https://loja.example")).toMatchObject({
      status: "failed",
      motivo: "site_indisponivel",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("site lento e DNS lento são limitados sem request tardio após timeout", async () => {
    vi.useFakeTimers();
    let resolver: ((value: unknown) => void) | undefined;
    lookup.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolver = resolve;
        }),
    );
    const leitura = lerSite("https://loja.example");
    await vi.advanceTimersByTimeAsync(LIMITES_LEITURA_SITE.tempoRequisicaoMs);
    expect(await leitura).toMatchObject({ status: "failed", motivo: "site_tempo_limite" });
    resolver?.([{ address: "93.184.216.34" }]);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("limita também corpo em streaming, mesmo sem content-length", async () => {
    const cancel = vi.fn();
    fetchMock.mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            controller.enqueue(new Uint8Array(LIMITES_LEITURA_SITE.bytesPorPagina + 1));
          },
          cancel,
        }),
        { headers: { "content-type": "text/html" } },
      ),
    );
    expect(await lerSite("https://loja.example")).toMatchObject({
      status: "failed",
      limiteAtingido: true,
      motivo: "site_limite_de_tamanho",
    });
    expect(cancel).toHaveBeenCalled();
  });
  it("corpo que não termina respeita o prazo e cancela a leitura", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    fetchMock.mockResolvedValue(
      new Response(new ReadableStream<Uint8Array>({ pull() {}, cancel }), {
        headers: { "content-type": "text/html" },
      }),
    );
    const leitura = lerSite("https://loja.example");
    await vi.advanceTimersByTimeAsync(LIMITES_LEITURA_SITE.tempoRequisicaoMs);
    expect(await leitura).toMatchObject({ status: "failed", motivo: "site_tempo_limite" });
    expect(cancel).toHaveBeenCalled();
  });
  it("site de JS puro é um desfecho esperado e legível", async () => {
    fetchMock.mockResolvedValue(html('<div id="app"></div><script src="/app.js"></script>'));
    expect(await lerSite("https://loja.example")).toMatchObject({
      status: "failed",
      motivo: "site_sem_conteudo_legivel",
      paginasLidas: 0,
    });
  });
  it("não escolhe arbitrariamente entre dois preços para a mesma identidade", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      html(
        `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "Banho e tosa", sku: "BANHO", offers: { "@type": "Offer", price: url.endsWith("/produtos") ? "90" : "80", priceCurrency: "BRL" } })}</script><a href="/produtos">Produtos</a>`,
      ),
    );
    const resultado = await lerSite("https://loja.example");
    expect(resultado.status).toBe("partial");
    expect(resultado.produtos).toHaveLength(0);
    expect(resultado.recusas).toContainEqual(
      expect.objectContaining({
        url: "https://loja.example/produtos",
        item: "Banho e tosa",
        motivo: "site_preco_conflitante",
      }),
    );
  });
});
