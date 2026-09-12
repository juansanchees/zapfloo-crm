import { describe, expect, it } from "vitest";
import { MODELO_PADRAO_ENSAIO, selecionarModeloEnsaio, type PainelEnsaio } from "@/lib/onboarding/ensaio";

describe("padrão único do ensaio", () => {
  const primeiro = { provider: "anthropic" as const, model_id: "qa-primeiro", display_name: "Primeiro" };
  const padrao = { provider: "openai" as const, model_id: "gpt-5.6-luna", display_name: "GPT-5.6 Luna" };
  it("usa o ID curado e não a posição nem o rótulo", () => {
    expect(MODELO_PADRAO_ENSAIO).toEqual({ provider: "openai", model_id: "gpt-5.6-luna" });
    expect(selecionarModeloEnsaio([primeiro, { ...padrao, display_name: "Nome local" }])).toMatchObject(MODELO_PADRAO_ENSAIO);
  });
  it("retirar o padrão não quebra: devolve o primeiro sem reordenar o catálogo", () => {
    const models: PainelEnsaio["models"] = [primeiro, { ...primeiro, model_id: "qa-segundo" }];
    Object.freeze(models);
    expect(selecionarModeloEnsaio(models)).toBe(primeiro);
    expect(models[0]).toBe(primeiro);
  });
  it("um ID igual de outro provedor não se passa pelo padrão", () => {
    expect(selecionarModeloEnsaio([primeiro, { ...padrao, provider: "openrouter" }])).toBe(primeiro);
  });
  it("sem nenhum modelo devolve ausência, nunca lança nem inventa ID", () => {
    expect(selecionarModeloEnsaio([])).toBeNull();
  });
});
