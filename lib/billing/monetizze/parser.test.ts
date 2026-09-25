import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { parseMonetizzePayload } from "./parser";

describe("parseMonetizzePayload", () => {
  it("normaliza o formulário real sem guardar PII fora dos campos necessários", () => {
    const raw = readFileSync(
      resolve(process.cwd(), "tests/fixtures/monetizze/postback-finalizada-aprovada.urlencoded"),
      "utf8",
    );

    const result = parseMonetizzePayload(raw, "application/x-www-form-urlencoded");

    expect(result).toMatchObject({
      ok: true,
      value: {
        accountKey: "fixture-chave-unica-invalida",
        saleCode: "fixture-8",
        eventCode: "2",
        productCode: "fixture-2",
        planReference: "fixture-31",
        buyerEmail: "cliente@example.test",
        targetStatus: "ativo",
      },
    });
    if (!result.ok) return;
    expect(result.value.webhookId).toMatch(/^legacy_[a-f0-9]{64}$/);
    expect(JSON.stringify(result.value)).not.toContain("00000000000");
    expect(JSON.stringify(result.value)).not.toContain("5511999990000");
  });

  it("aceita o JSON atual e usa o id do disparo como idempotência", () => {
    const result = parseMonetizzePayload(JSON.stringify({
      id: "webhook-123",
      data: "2026-09-24 12:30:00",
      chave_unica: "segredo",
      codigo_venda: "venda-1",
      codigo_status: "2",
      postback_evento: "2",
      produto: { codigo: "produto-1" },
      plano: { referencia: "CY386459" },
      assinatura: { codigo: "assinatura-1", parcela: "1" },
      comprador: { email: "dono@example.test", telefone: "5511999999999" },
      venda: { src: "referencia-assinada" },
    }), "application/json");

    expect(result).toMatchObject({
      ok: true,
      value: {
        webhookId: "webhook-123",
        eventAt: "2026-09-24T15:30:00.000Z",
        installmentNumber: 1,
        subscriptionCode: "assinatura-1",
        sourceReference: "referencia-assinada",
        targetStatus: "ativo",
      },
    });
  });

  it("recusa corpo malformado e campo obrigatório ausente", () => {
    expect(parseMonetizzePayload("{", "application/json")).toEqual({ ok: false, code: "invalid_json" });
    expect(parseMonetizzePayload("chave_unica=x", "application/x-www-form-urlencoded"))
      .toEqual({ ok: false, code: "missing_required_field" });
  });

  it.each([
    ["2", "ativo", "sale.approved"],
    ["101", "ativo", "subscription.active"],
    ["102", "recusado", "subscription.payment_failed"],
    ["103", "cancelado", "subscription.cancelled"],
    ["104", null, "monetizze.104"],
  ])("mapeia o evento %s para a decisão comercial esperada", (codigo, targetStatus, eventKind) => {
    const result = parseMonetizzePayload(JSON.stringify({
      id: `webhook-${codigo}`,
      data: "2026-09-24 12:30:00",
      chave_unica: "segredo",
      codigo_venda: `venda-${codigo}`,
      codigo_status: codigo,
      postback_evento: codigo,
      produto: { codigo: "produto-1" },
      plano: { referencia: "CY386459" },
    }), "application/json");

    expect(result).toMatchObject({ ok: true, value: { targetStatus, eventKind } });
  });
});
