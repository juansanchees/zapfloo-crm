import { describe, expect, it } from "vitest";
import { lerEstadoDoSite, siteFoiRevisado } from "./estado";
import {
  aceitaTextoColado,
  canonizarTipoDeFonte,
  ePerguntaEResposta,
  permiteCadastroManual,
} from "@/lib/ai/rag/tipos-de-fonte";

describe("estado e revisão da fonte site", () => {
  it("JSON incompleto ou legado nunca lança nem aprova", () => {
    for (const metadata of [null, {}, { site: {} }, { site: { url: "não é URL" } }]) {
      expect(lerEstadoDoSite(metadata)).toBeNull();
      expect(siteFoiRevisado(metadata)).toBe(false);
    }
  });
  it("normaliza a fila e exige conclusão + revisão com autor", () => {
    const site = { url: "https://loja.example/" };
    expect(lerEstadoDoSite({ site })).toMatchObject({
      tentativas: 0,
      concluidaEm: null,
      recusas: [],
    });
    expect(siteFoiRevisado({ site })).toBe(false);
    const revisado = {
      ...site,
      concluidaEm: "2026-09-12T10:00:00.000Z",
      revisadoEm: "2026-09-12T11:00:00.000Z",
      revisadoPor: "11111111-1111-4111-8111-111111111111",
      revisaoConteudoHash: "a".repeat(64),
    };
    expect(siteFoiRevisado({ site: revisado })).toBe(true);
    expect(siteFoiRevisado({ site: { ...revisado, revisadoPor: undefined } })).toBe(false);
  });
  it("site entra por endereço e continua sendo FAQ revisável", () => {
    expect(canonizarTipoDeFonte(" SITE ")).toBe("site");
    expect(aceitaTextoColado("site")).toBe(false);
    expect(ePerguntaEResposta("site")).toBe(true);
    expect(permiteCadastroManual("site")).toBe(true);
    expect(permiteCadastroManual("faq")).toBe(true);
  });
});
