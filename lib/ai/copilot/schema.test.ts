import { describe, expect, it } from "vitest";

import { copilotRequestSchema } from "./schema";

describe("contrato de entrada do copiloto", () => {
  it("aceita até 2.000 caracteres e seis mensagens de contexto", () => {
    expect(
      copilotRequestSchema.safeParse({
        question: "a".repeat(2_000),
        history: Array.from({ length: 6 }, () => ({ role: "user", content: "contexto" })),
      }).success,
    ).toBe(true);
  });

  it("recusa perguntas e histórico acima do limite", () => {
    expect(
      copilotRequestSchema.safeParse({ question: "a".repeat(2_001), history: [] }).success,
    ).toBe(false);
    expect(
      copilotRequestSchema.safeParse({
        question: "ok",
        history: Array.from({ length: 7 }, () => ({ role: "user", content: "contexto" })),
      }).success,
    ).toBe(false);
  });
});
