import { describe, expect, it } from "vitest";

import { validarChaveUnicaMonetizze } from "./auth";

describe("validarChaveUnicaMonetizze", () => {
  it("aceita somente a chave exata, sem lançar para comprimentos diferentes", () => {
    expect(validarChaveUnicaMonetizze("segredo-correto", "segredo-correto")).toBe(true);
    expect(validarChaveUnicaMonetizze("x", "segredo-correto")).toBe(false);
    expect(validarChaveUnicaMonetizze("", "segredo-correto")).toBe(false);
    expect(validarChaveUnicaMonetizze("segredo-correto", "")).toBe(false);
  });
});
