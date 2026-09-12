import { describe, expect, it } from "vitest";

import {
  aplicarPresetDeNegocio,
  PACOTE_POR_TIPO_DE_NEGOCIO,
} from "@/lib/ai/agents/preset-de-negocio";

const catalogo = [
  { name: "ver_horarios", risco: "seguro" as const, pacotes: ["vender" as const] },
  { name: "marcar_consulta", risco: "atencao" as const, pacotes: ["vender" as const] },
  { name: "desmarcar_consulta", risco: "critico" as const, pacotes: ["vender" as const] },
  { name: "outra_jornada", risco: "seguro" as const, pacotes: ["reter" as const] },
];

describe("configuração pronta por tipo de negócio", () => {
  it("clínica reaproveita o pacote canônico sem inventar ids de ferramenta", () => {
    expect(PACOTE_POR_TIPO_DE_NEGOCIO.clinica).toBe("vender");
    expect(aplicarPresetDeNegocio([], catalogo, "clinica")).toEqual([
      "ver_horarios",
      "marcar_consulta",
    ]);
  });

  it("nunca liga automaticamente uma capacidade de efeito irreversível", () => {
    expect(aplicarPresetDeNegocio([], catalogo, "clinica")).not.toContain(
      "desmarcar_consulta",
    );
  });

  it("preserva capacidades que a pessoa já tinha escolhido", () => {
    expect(aplicarPresetDeNegocio(["outra_jornada"], catalogo, "clinica")).toEqual([
      "ver_horarios",
      "marcar_consulta",
      "outra_jornada",
    ]);
  });
});
