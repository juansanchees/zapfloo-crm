// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { traduzir } from "@/lib/i18n/dicionario";

describe("textos da primeira impressão", () => {
  it("descreve as conferências como proteção, não como proibição", () => {
    const form = readFileSync("app/onboarding/setup-ai/_form.tsx", "utf8");
    expect(form).toContain('t("O que ele sempre confere antes de enviar")');
    expect(form).not.toContain('t("E nunca vai fazer")');
    expect(traduzir("O que ele sempre confere antes de enviar", "es")).not.toBe(
      "O que ele sempre confere antes de enviar",
    );
  });

  it("usa português consistente no título e na descrição da página de agentes", () => {
    const page = readFileSync("app/app/ai/agents/page.tsx", "utf8");
    expect(page).toContain('title={traduzir("Agentes de IA", idioma)}');
    expect(page).toContain("Configure o comportamento dos agentes que respondem no WhatsApp.");
    expect(page).not.toContain("Agents de IA");
    expect(page).not.toContain("dos agents");
    expect(traduzir("Configure o comportamento dos agentes que respondem no WhatsApp.", "es")).not.toBe(
      "Configure o comportamento dos agentes que respondem no WhatsApp.",
    );
  });
});
