import { describe, expect, it } from "vitest";

import {
  configuracaoInicialDeLlm,
  provedorPadraoDaInstalacao,
} from "@/lib/ai/installation-default";

describe("provedor padrão da instalação", () => {
  it.each(["anthropic", "openai", "openrouter", "google"] as const)(
    "aceita %s",
    (provider) => expect(provedorPadraoDaInstalacao(provider)).toBe(provider),
  );

  it("cai para anthropic diante de vazio ou lixo", () => {
    expect(provedorPadraoDaInstalacao("")).toBe("anthropic");
    expect(provedorPadraoDaInstalacao("qualquer-coisa")).toBe("anthropic");
  });

  it("mescla o provider sem apagar outras configurações da organização", () => {
    expect(
      configuracaoInicialDeLlm({ plan: "pro", branding: { name: "Zapfloo" } }, "openai"),
    ).toEqual({
      plan: "pro",
      branding: { name: "Zapfloo" },
      llm: { provider: "openai" },
    });
  });
});
