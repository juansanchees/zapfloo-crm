// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  CHECKOUT_REFERENCE_TTL_MS,
  createCheckoutReference,
  verifyCheckoutReference,
} from "./checkout-reference";

const SECRET = "monetizze-chave-unica-ficticia-com-32-bytes";
const ORG_ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-09-24T12:00:00.000Z");

describe("referência opaca do checkout Monetizze", () => {
  it("assina UUID, instante e nonce sem expor UUID cru no src", () => {
    const token = createCheckoutReference(ORG_ID, {
      secret: SECRET,
      now: NOW,
      nonce: "00112233445566778899aabbccddeeff",
    });

    expect(token).not.toContain(ORG_ID);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(verifyCheckoutReference(token, { secret: SECRET, now: NOW })).toEqual({
      organizationId: ORG_ID,
      issuedAt: NOW.toISOString(),
      nonce: "00112233445566778899aabbccddeeff",
    });
  });

  it("recusa adulteração da carga ou da assinatura", () => {
    const token = createCheckoutReference(ORG_ID, { secret: SECRET, now: NOW });
    const [payload, signature] = token.split(".");
    const payloadAlterado = `${payload!.slice(0, -1)}${payload!.endsWith("A") ? "B" : "A"}`;
    const assinaturaAlterada = `${signature!.slice(0, -1)}${signature!.endsWith("A") ? "B" : "A"}`;

    expect(verifyCheckoutReference(`${payloadAlterado}.${signature}`, { secret: SECRET, now: NOW })).toBeNull();
    expect(verifyCheckoutReference(`${payload}.${assinaturaAlterada}`, { secret: SECRET, now: NOW })).toBeNull();
  });

  it("vence exatamente no limite e não aceita emissão futura", () => {
    const token = createCheckoutReference(ORG_ID, { secret: SECRET, now: NOW });
    expect(verifyCheckoutReference(token, {
      secret: SECRET,
      now: new Date(NOW.getTime() + CHECKOUT_REFERENCE_TTL_MS - 1),
    })).not.toBeNull();
    expect(verifyCheckoutReference(token, {
      secret: SECRET,
      now: new Date(NOW.getTime() + CHECKOUT_REFERENCE_TTL_MS),
    })).toBeNull();
    expect(verifyCheckoutReference(token, {
      secret: SECRET,
      now: new Date(NOW.getTime() - 1),
    })).toBeNull();
  });

  it("separa o contexto de checkout de qualquer outra assinatura HMAC", () => {
    const token = createCheckoutReference(ORG_ID, { secret: SECRET, now: NOW });
    expect(verifyCheckoutReference(token, {
      secret: SECRET,
      now: NOW,
      context: "zapfloo:outro-contexto:v1",
    })).toBeNull();
  });

  it.each(["", "curto", "x".repeat(15)])("falha fechado com segredo insuficiente (%s)", (secret) => {
    expect(() => createCheckoutReference(ORG_ID, { secret, now: NOW })).toThrow(/segredo/i);
    const token = createCheckoutReference(ORG_ID, { secret: SECRET, now: NOW });
    expect(verifyCheckoutReference(token, { secret, now: NOW })).toBeNull();
  });

  it.each(["", "a.b", "x".repeat(4097)])("token malformado não lança (%s)", (token) => {
    expect(verifyCheckoutReference(token, { secret: SECRET, now: NOW })).toBeNull();
  });
});
