import { describe, expect, it } from "vitest";

import { PACOTES as PACOTES_DO_ONBOARDING } from "@/lib/onboarding/pacotes-de-funil";
import { MODELOS_DE_FUNIL } from "./modelos-de-funil";

describe("catálogo único de modelos de funil", () => {
  it("mantém os seis nichos do onboarding e acrescenta quatro modelos de pós-venda", () => {
    expect(PACOTES_DO_ONBOARDING).toHaveLength(6);
    expect(MODELOS_DE_FUNIL).toHaveLength(10);
    expect(MODELOS_DE_FUNIL.filter((modelo) => modelo.categoria === "pos_venda").map((modelo) => modelo.id)).toEqual([
      "confirmacao",
      "entrega-de-acesso",
      "suporte-pos-venda",
      "reativacao",
    ]);
  });

  it("pós-venda nunca habilita movimento automático de card", () => {
    const posVenda = MODELOS_DE_FUNIL.filter((modelo) => modelo.categoria === "pos_venda");
    expect(posVenda.flatMap((modelo) => modelo.proposta.etapas).every((etapa) => etapa.passo === null)).toBe(true);
  });

  it("o onboarding e a galeria leem os mesmos objetos de nicho", () => {
    expect(PACOTES_DO_ONBOARDING).toEqual(MODELOS_DE_FUNIL.filter((modelo) => modelo.comoSeApresenta));
  });
});
