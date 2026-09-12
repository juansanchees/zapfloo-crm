import { describe, expect, it } from "vitest";

import { escolherCredencialInicial } from "@/lib/ai/agents/configuracao-inicial";

const ativaSemValidar = {
  id: "ativa",
  provider: "anthropic",
  is_active: true,
  validated_at: null,
};

describe("configuração inicial do agente", () => {
  it("permite criar rascunho com chave ativa ainda não validada", () => {
    expect(escolherCredencialInicial([ativaSemValidar], "anthropic", false)).toBe("ativa");
  });

  it("prefere uma chave validada e ignora provedor ou chave inativa", () => {
    expect(
      escolherCredencialInicial(
        [
          ativaSemValidar,
          { id: "inativa", provider: "anthropic", is_active: false, validated_at: "2026-09-12" },
          { id: "outro", provider: "google", is_active: true, validated_at: "2026-09-12" },
          { id: "validada", provider: "anthropic", is_active: true, validated_at: "2026-09-12" },
        ],
        "anthropic",
        true,
      ),
    ).toBe("validada");
  });

  it("prefere a chave da instalação a uma BYOK pendente ou inválida", () => {
    expect(escolherCredencialInicial([ativaSemValidar], "anthropic", true)).toBe(
      "__instalacao__",
    );
  });

  it("sem chave da instalação, prefere uma BYOK pendente à que já falhou", () => {
    expect(
      escolherCredencialInicial(
        [
          { ...ativaSemValidar, id: "invalida", validation_error: "401" },
          { ...ativaSemValidar, id: "pendente" },
        ],
        "anthropic",
        false,
      ),
    ).toBe("pendente");
  });
});
