import { describe, expect, it } from "vitest";

import { construirCheckoutMonetizze } from "@/lib/billing/checkout";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const SECRET = "segredo-monetizze-com-tamanho-suficiente";

describe("checkout da Monetizze", () => {
  it.each([
    ["basico", "https://app.monetizze.com.br:443/checkout/BASICO"],
    ["essencial", "https://app.monetizze.com.br/checkout/ESSENCIAL"],
    ["completo", "https://app.monetizze.com.br/checkout/COMPLETO"],
  ] as const)("monta o link de %s com email e src assinado", (plano, checkout) => {
    const result = construirCheckoutMonetizze({
      plano,
      email: "dona+clinica@example.com",
      organizationId: ORGANIZATION_ID,
      secret: SECRET,
      checkoutUrls: { basico: checkout, essencial: checkout, completo: checkout },
      now: new Date("2026-09-24T12:00:00.000Z"),
      nonce: "a".repeat(32),
    });

    expect(result).not.toBeNull();
    const url = new URL(result!);
    expect(url.origin).toBe("https://app.monetizze.com.br");
    expect(url.searchParams.get("email")).toBe("dona+clinica@example.com");
    expect(url.searchParams.get("src")).toMatch(/^[^.]+\.[^.]+$/);
    expect(result).not.toContain(ORGANIZATION_ID);
    expect(result).not.toContain(SECRET);
  });

  it.each([
    "",
    "http://app.monetizze.com.br/checkout/BASICO",
    "https://app.monetizze.com.br:444/checkout/BASICO",
    "https://monetizze.example/checkout/BASICO",
    "javascript:alert(1)",
    "não-é-url",
  ])("degrada para indisponível sem produzir link inseguro: %s", (checkout) => {
    expect(
      construirCheckoutMonetizze({
        plano: "basico",
        email: "dona@example.com",
        organizationId: ORGANIZATION_ID,
        secret: SECRET,
        checkoutUrls: { basico: checkout, essencial: "", completo: "" },
      }),
    ).toBeNull();
  });

  it("preserva parâmetros aprovados do checkout e sobrescreve email/src com valores confiáveis", () => {
    const result = construirCheckoutMonetizze({
      plano: "completo",
      email: "admin@example.com",
      organizationId: ORGANIZATION_ID,
      secret: SECRET,
      checkoutUrls: {
        basico: "",
        essencial: "",
        completo:
          "https://app.monetizze.com.br/checkout/COMPLETO?split=12&email=ataque@example.com&src=ataque",
      },
      now: new Date("2026-09-24T12:00:00.000Z"),
      nonce: "b".repeat(32),
    });

    const url = new URL(result!);
    expect(url.searchParams.get("split")).toBe("12");
    expect(url.searchParams.getAll("email")).toEqual(["admin@example.com"]);
    expect(url.searchParams.getAll("src")).toHaveLength(1);
    expect(url.searchParams.get("src")).not.toBe("ataque");
  });

  it("não cria link quando o segredo está ausente ou curto", () => {
    for (const secret of ["", "curto"]) {
      expect(
        construirCheckoutMonetizze({
          plano: "basico",
          email: "dona@example.com",
          organizationId: ORGANIZATION_ID,
          secret,
          checkoutUrls: {
            basico: "https://app.monetizze.com.br/checkout/BASICO",
            essencial: "",
            completo: "",
          },
        }),
      ).toBeNull();
    }
  });
});
