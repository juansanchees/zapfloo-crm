// @vitest-environment node
import { describe, expect, it } from "vitest";
import { extrairPaginaDoSite } from "./extracao";

const origem = "https://loja.example/produtos";
const ld = (valor: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(valor)}</script>`;
const produto = (price: unknown, extra: Record<string, unknown> = {}) => ({
  "@type": "Product",
  name: "Banho e tosa",
  sku: "BANHO",
  description: "Cuidado para o seu pet",
  offers: { "@type": "Offer", price, priceCurrency: "BRL", ...extra },
});

describe("extração conservadora de site", () => {
  it("extrai produto com preço exato, FAQ e texto útil sem executar scripts", () => {
    const html = `<html><head><title>Pet do bairro</title></head><body><h1>Cuidamos do seu pet</h1><p>Banho, tosa e atendimento com hora marcada.</p>
      ${ld({ "@graph": [produto("129,90"), { "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "Preciso agendar?", acceptedAnswer: { "@type": "Answer", text: "Sim, pelo telefone da loja." } }] }] })}
      <script>throw new Error('não execute')</script><a href="/sobre">Sobre nós</a><a href="/politica">Política</a></body></html>`;
    const resultado = extrairPaginaDoSite(html, origem);
    expect(resultado.produtos).toEqual([
      expect.objectContaining({
        nome: "Banho e tosa",
        preco_cents: 12990,
        moeda: "BRL",
        url: origem,
      }),
    ]);
    expect(resultado.perguntas).toEqual([
      { pergunta: "Preciso agendar?", resposta: "Sim, pelo telefone da loja.", url: origem },
    ]);
    expect(resultado.texto).toContain("Banho, tosa e atendimento");
    expect(resultado.texto).not.toContain("não execute");
    expect(resultado.links).toEqual(["/sobre"]);
    expect(resultado.recusas).toEqual([]);
  });
  it.each([
    "de 89,90 por 49,90",
    "a partir de 99,90",
    "12x 10,00",
    "12,,99",
    "consultar",
    1.005,
    Infinity,
  ])("recusa preço ambíguo %s com URL e linha", (preco) => {
    const resultado = extrairPaginaDoSite(
      `<!doctype html>\n<section>Produtos</section>\n${ld(produto(preco))}`,
      origem,
    );
    expect(resultado.produtos).toHaveLength(0);
    expect(resultado.recusas).toEqual([
      { url: origem, linha: 3, motivo: "site_preco_ambiguo", item: "Banho e tosa" },
    ]);
  });
  it.each(["1299.9", "R$ 1.299,90", "1,299.90"])("reusa conversão monetária exata: %s", (preco) => {
    expect(extrairPaginaDoSite(ld(produto(preco)), origem).produtos[0]?.preco_cents).toBe(129990);
  });
  it("recusa intervalo, múltiplas ofertas e preço sem moeda", () => {
    const resultado = extrairPaginaDoSite(
      ld([
        produto("12", { "@type": "AggregateOffer", lowPrice: "10", highPrice: "20" }),
        {
          ...produto("12"),
          offers: [
            { price: "12", priceCurrency: "BRL" },
            { price: "14", priceCurrency: "BRL" },
          ],
        },
        produto("12", { priceCurrency: undefined }),
      ]),
      origem,
    );
    expect(resultado.produtos).toHaveLength(0);
    expect(resultado.recusas.map((item) => item.motivo)).toEqual([
      "site_preco_ambiguo",
      "site_preco_ambiguo",
      "site_moeda_ausente",
    ]);
  });
  it("lê microdata explícita e FAQ details com entidades, sem adivinhar texto comercial", () => {
    const html = `<article itemscope itemtype="https://schema.org/Product"><h2 itemprop="name">Banho &amp; tosa</h2><meta itemprop="sku" content="BT"><span itemprop="price">R$ 80,00</span><meta itemprop="priceCurrency" content="BRL"></article>
      <details><summary>Vocês atendem sábados?</summary><p>Sim, até 12h.</p></details>
      <article><h2>Preço promocional desconhecido</h2><span>De R$ 100 por R$ 50</span></article>`;
    const resultado = extrairPaginaDoSite(html, origem);
    expect(resultado.produtos).toHaveLength(1);
    expect(resultado.produtos[0]).toMatchObject({ nome: "Banho & tosa", preco_cents: 8000 });
    expect(resultado.perguntas[0]).toMatchObject({
      pergunta: "Vocês atendem sábados?",
      resposta: "Sim, até 12h.",
    });
  });
  it("não trata scripts ou HTML malformado como instruções executáveis", () => {
    const resultado = extrairPaginaDoSite(
      `<div id="root"></div><script src="/app.js"></script>`,
      origem,
    );
    expect(resultado.texto).toBe("");
    expect(resultado.produtos).toEqual([]);
  });
  it("identidade é estável entre páginas do mesmo site e separada de SKU manual", () => {
    const a = extrairPaginaDoSite(ld(produto("10")), origem).produtos[0]!;
    const b = extrairPaginaDoSite(ld(produto("10")), "https://loja.example/").produtos[0]!;
    expect(a.codigo).toBe(b.codigo);
    expect(a.codigo).toMatch(/^site-[a-f0-9]{24}$/);
  });
});
