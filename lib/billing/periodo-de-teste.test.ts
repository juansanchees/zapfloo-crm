import { describe, expect, it } from "vitest";
import { fimDoPeriodoDeTeste, tempoRestanteDoTeste } from "./periodo-de-teste";

describe("período de testes comercial", () => {
  it("deriva sete dias completos da data persistida, sem depender do login", () => {
    expect(fimDoPeriodoDeTeste("2026-09-09T22:30:00-03:00")).toBe("2026-09-17T01:30:00.000Z");
    expect(fimDoPeriodoDeTeste("2026-12-28T10:00:00Z")).toBe("2027-01-04T10:00:00.000Z");
  });
  it("não fabrica uma data quando o cadastro não pôde ser lido", () => {
    for (const valor of [null, undefined, "", "inválido"]) expect(fimDoPeriodoDeTeste(valor)).toBeNull();
  });
  it("mostra dias, horas e minutos e encerra exatamente no vencimento", () => {
    const fim = "2026-09-17T01:30:00Z";
    expect(tempoRestanteDoTeste(fim, Date.parse("2026-09-15T00:29:00Z"))).toEqual({ encerrado: false, dias: 2, horas: 1, minutos: 1 });
    expect(tempoRestanteDoTeste(fim, Date.parse(fim) - 1)).toEqual({ encerrado: false, dias: 0, horas: 0, minutos: 1 });
    for (const agora of [Date.parse(fim), Date.parse(fim) + 1000]) {
      expect(tempoRestanteDoTeste(fim, agora)).toEqual({ encerrado: true, dias: 0, horas: 0, minutos: 0 });
    }
  });
  it("não exibe NaN para instantes inválidos", () => {
    expect(tempoRestanteDoTeste("inválido", Date.now())).toBeNull();
  });
});
