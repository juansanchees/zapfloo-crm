import { describe, expect, it } from "vitest";

import { podeManterSelecaoDeCredencial } from "./selecao";

describe("seleção de credencial pertence à plataforma", () => {
  it("plataforma pode escolher, trocar e remover", () => {
    for (const solicitada of ["cred-nova", null, undefined]) {
      expect(
        podeManterSelecaoDeCredencial({
          isPlatformAdmin: true,
          solicitada,
          atual: "cred-antiga",
        }),
      ).toBe(true);
    }
  });

  it("tenant preserva uma credencial existente, mas não a troca nem remove", () => {
    expect(
      podeManterSelecaoDeCredencial({
        isPlatformAdmin: false,
        solicitada: "cred-antiga",
        atual: "cred-antiga",
      }),
    ).toBe(true);
    expect(
      podeManterSelecaoDeCredencial({
        isPlatformAdmin: false,
        solicitada: "cred-nova",
        atual: "cred-antiga",
      }),
    ).toBe(false);
    expect(
      podeManterSelecaoDeCredencial({
        isPlatformAdmin: false,
        solicitada: null,
        atual: "cred-antiga",
      }),
    ).toBe(false);
  });

  it("tenant cria agente novo somente com a chave da instalação", () => {
    expect(
      podeManterSelecaoDeCredencial({
        isPlatformAdmin: false,
        solicitada: null,
        atual: undefined,
      }),
    ).toBe(true);
    expect(
      podeManterSelecaoDeCredencial({
        isPlatformAdmin: false,
        solicitada: "cred-conhecida",
        atual: undefined,
      }),
    ).toBe(false);
  });

  it("tenant não mantém uma credencial ligada ao trocar de provedor", () => {
    expect(
      podeManterSelecaoDeCredencial({
        isPlatformAdmin: false,
        solicitada: "cred-antiga",
        atual: "cred-antiga",
        providerSolicitado: "anthropic",
        providerAtual: "openai",
      }),
    ).toBe(false);
  });

  it("tenant troca de provedor sem escolher UUID e deixa o servidor resolver a chave", () => {
    for (const solicitada of [undefined, null]) {
      expect(
        podeManterSelecaoDeCredencial({
          isPlatformAdmin: false,
          solicitada,
          atual: "cred-antiga",
          providerSolicitado: "anthropic",
          providerAtual: "openai",
        }),
      ).toBe(true);
    }
  });
});
