import { afterEach, describe, expect, it } from "vitest";
import { coletarTextosVisiveis } from "../e2e/helpers/i18n-textos-visiveis";

afterEach(() => { document.body.innerHTML = ""; });

describe("a régua distingue inicial decorativa de texto do operador", () => {
  it.each([
    ["E", "E2E Test Org", "Sua empresa"],
    ["C", "Clínica Bem Viver", "Tu empresa"],
    ["Á", "Árvore", "Sua empresa"],
  ])("omite só a inicial derivada %s e preserva nome e rótulo", (inicial, nome, rotulo) => {
    document.body.innerHTML = `<aside><div><span aria-hidden="true">${inicial}</span><span><span>${nome}</span><span>${rotulo}</span></span></div></aside>`;
    expect(coletarTextosVisiveis()).toEqual([nome, rotulo]);
  });

  it.each([
    ["texto comum", "<p>E</p>"],
    ["botão", "<button>E</button>"],
    ["aria-hidden fora do cartão", '<aside><span aria-hidden="true">E</span></aside>'],
    ["cartão fora da sidebar", '<div><span aria-hidden="true">E</span><span><span>Empresa</span><span>Sua empresa</span></span></div>'],
    ["inicial sem aria-hidden", '<aside><div><span>E</span><span><span>Empresa</span><span>Sua empresa</span></span></div></aside>'],
    ["inicial que não deriva do nome", '<aside><div><span aria-hidden="true">E</span><span><span>Clínica</span><span>Sua empresa</span></span></div></aside>'],
    ["nome adjacente sem rótulo da empresa", '<aside><div><span aria-hidden="true">E</span><span><span>Empresa</span><span>Operação</span></span></div></aside>'],
    ["rótulo que não é o usado pelo produto", '<aside><div><span aria-hidden="true">E</span><span><span>Empresa</span><span>Su empresa</span></span></div></aside>'],
    ["texto acessível sr-only", '<span class="sr-only">E</span>'],
  ])("continua medindo %s", (_caso, html) => {
    document.body.innerHTML = html;
    expect(coletarTextosVisiveis()).toContain("E");
  });

  it("preserva frases de interface mesmo com aria-hidden dentro do cartão", () => {
    document.body.innerHTML = '<aside><div><span aria-hidden="true">E</span><span><span>Empresa</span><span>Tu empresa</span></span><span aria-hidden="true">Novo contato</span></div></aside>';
    expect(coletarTextosVisiveis()).toEqual(["Empresa", "Tu empresa", "Novo contato"]);
  });
});
