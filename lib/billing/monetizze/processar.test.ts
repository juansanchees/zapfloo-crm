import { describe, expect, it, vi } from "vitest";

import { processarPostbackMonetizze } from "./processar";
import type { EventoMonetizzeNormalizado } from "./parser";

const EVENTO: EventoMonetizzeNormalizado = {
  accountKey: "segredo",
  webhookId: "webhook-1",
  saleCode: "venda-1",
  saleStatus: "2",
  eventCode: "2",
  eventKind: "sale.approved",
  eventAt: "2026-09-24T15:30:00.000Z",
  installmentNumber: 1,
  productCode: "produto-1",
  subscriptionCode: "assinatura-1",
  planReference: "CY386459",
  buyerEmail: "dono@example.test",
  sourceReference: "src-assinado",
  targetStatus: "ativo",
  paymentConfirmedAt: "2026-09-24T15:30:00.000Z",
};

const refs = { basico: "CY386459", essencial: "FW386460", completo: "VM386461" };

describe("processarPostbackMonetizze", () => {
  it("resolve organização, calcula período e chama uma única RPC atômica", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { status: "applied" }, error: null });
    const result = await processarPostbackMonetizze(EVENTO, {
      secret: "segredo",
      planReferences: refs,
      rpc,
      resolveOrganization: vi.fn().mockResolvedValue({
        kind: "resolved",
        via: "signed_src",
        organizationId: "11111111-1111-4111-8111-111111111111",
        buyerEmailHash: "a".repeat(64),
        buyerEmailMasked: "d***@example.test",
      }),
    });

    expect(result).toEqual({ status: "applied" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("fn_processar_evento_monetizze", expect.objectContaining({
      p_plan_id: "basico",
      p_target_status: "ativo",
      p_paid_through: "2026-10-24T15:30:00.000Z",
      p_access_until: "2026-10-27T15:30:00.000Z",
      p_organization_id: "11111111-1111-4111-8111-111111111111",
    }));
  });

  it("plano desconhecido nunca altera assinatura", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { status: "ignored_unknown_product" }, error: null });
    const result = await processarPostbackMonetizze({ ...EVENTO, planReference: "desconhecido" }, {
      secret: "segredo",
      planReferences: refs,
      rpc,
      resolveOrganization: vi.fn(),
    });

    expect(result).toEqual({ status: "ignored_unknown_product" });
    expect(rpc).toHaveBeenCalledWith("fn_processar_evento_monetizze", expect.objectContaining({
      p_outcome: "ignored_unknown_product",
      p_organization_id: null,
      p_plan_id: null,
    }));
  });

  it("compra sem vínculo fica pendente para conciliação humana", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { status: "pending_match" }, error: null });
    const result = await processarPostbackMonetizze(EVENTO, {
      secret: "segredo",
      planReferences: refs,
      rpc,
      resolveOrganization: vi.fn().mockResolvedValue({
        kind: "pending",
        reason: "no_admin_match",
        buyerEmailHash: "b".repeat(64),
        buyerEmailMasked: "d***@example.test",
      }),
    });

    expect(result).toEqual({ status: "pending_match" });
    expect(rpc).toHaveBeenCalledWith("fn_processar_evento_monetizze", expect.objectContaining({
      p_outcome: "pending_match",
      p_organization_id: null,
      p_buyer_email_hash: "b".repeat(64),
    }));
  });
});
