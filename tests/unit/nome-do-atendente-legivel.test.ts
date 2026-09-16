import { describe, expect, it } from "vitest";

import { rotuloDoAtendente } from "@/lib/users/nome-do-atendente";

describe("nome legível de quem atende", () => {
  it("mostra Você para a própria conta, mesmo sem nome", () => {
    expect(rotuloDoAtendente({ userId: "u-1", usuarioAtualId: "u-1", role: "admin" })).toBe("Você");
  });

  it("não substitui nome ausente por UUID nem por e-mail", () => {
    const rotulo = rotuloDoAtendente({ userId: "cc5d15c1-cd5b-40b0-85ab-136236ba4f1b", role: "agent" });
    expect(rotulo).toBe("Sem nome — Atendente");
    expect(rotulo).not.toContain("cc5d15c1");
    expect(rotulo).not.toContain("@");
  });
});
