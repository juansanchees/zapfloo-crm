import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { POST } from "./route";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ORG = "62a8bc44-c61a-4ee0-863c-fb84da9e8201";
const PRODUTO = "62a8bc44-c61a-4ee0-863c-fb84da9e8202";
const consultas = {
  update: vi.fn(), eq: vi.fn(), in: vi.fn(), select: vi.fn(),
};

function pedido(corpo: unknown) {
  return new NextRequest("http://localhost/api/v1/products/confirmar-site", {
    method: "POST", body: JSON.stringify(corpo),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({
    ok: true, user: { id: "gestor", idioma: "pt-BR" }, org: { orgId: ORG },
  } as never);
  consultas.update.mockReturnValue(consultas);
  consultas.eq.mockReturnValue(consultas);
  consultas.in.mockReturnValue(consultas);
  consultas.select.mockResolvedValue({ data: [{ id: PRODUTO }], error: null });
  vi.mocked(createClient).mockResolvedValue({ from: () => consultas } as never);
});

describe("confirmar produtos do site", () => {
  it("só ativa o lote conferido, com escopo, origem e estado impostos pelo servidor", async () => {
    const response = await POST(pedido({ product_ids: [PRODUTO, PRODUTO] }));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ confirmados: 1 });
    expect(requireRole).toHaveBeenCalledWith("manager", expect.any(Object));
    expect(consultas.update).toHaveBeenCalledWith({ ativo: true });
    expect(consultas.eq.mock.calls).toEqual([["organization_id", ORG], ["origem", "site"], ["ativo", false]]);
    expect(consultas.in).toHaveBeenCalledWith("id", [PRODUTO]);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: ORG, action: "catalog_product.updated",
      metadata: { origem: "site", operacao: "confirmar_rascunhos", confirmados: 1 },
    }));
  });

  it.each([
    ["lote vazio", { product_ids: [] }], ["id inválido", { product_ids: ["invalido"] }],
    ["organização do corpo", { product_ids: [PRODUTO], organization_id: ORG }],
    ["alteração de preço", { product_ids: [PRODUTO], preco_cents: 1 }],
    ["lote acima de 500", { product_ids: Array.from({ length: 501 }, () => PRODUTO) }],
  ])("recusa %s sem escrever", async (_nome, corpo) => {
    expect((await POST(pedido(corpo))).status).toBe(422);
    expect(consultas.update).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("devolve a recusa do guard antes de consultar o catálogo", async () => {
    vi.mocked(requireRole).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    expect((await POST(pedido({ product_ids: [PRODUTO] }))).status).toBe(403);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("uma repetição sem efeito não fabrica auditoria de alteração", async () => {
    consultas.select.mockResolvedValue({ data: [], error: null });
    expect((await (await POST(pedido({ product_ids: [PRODUTO] }))).json()).data).toEqual({ confirmados: 0 });
    expect(audit).not.toHaveBeenCalled();
  });

  it("falha de banco é visível e não registra confirmação", async () => {
    consultas.select.mockResolvedValue({ data: null, error: { message: "falha controlada" } });
    const response = await POST(pedido({ product_ids: [PRODUTO] }));
    expect(response.status).toBe(500);
    expect((await response.json()).error.message).toBe("Não consegui confirmar os produtos. Tente novamente.");
    expect(audit).not.toHaveBeenCalled();
  });
});
