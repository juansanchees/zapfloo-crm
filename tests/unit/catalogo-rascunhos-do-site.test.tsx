import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProdutosClient } from "@/app/app/products/_client";
import { apiClient } from "@/lib/api/client";
import type { Produto } from "@/lib/schemas/produtos";

vi.mock("@/lib/api/client", () => ({ apiClient: { post: vi.fn(async () => ({ data: { confirmados: 1 } })), patch: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));

const base: Produto = {
  id: "site-a", codigo: "SITE-A", nome: "Consulta", origem: "site", ativo: false,
  preco_cents: 10000, moeda: "BRL", descricao: null, marca: null, categoria: null,
  custo_cents: null, controla_estoque: false, quantidade: 0, imagem_url: null, updated_at: "2026-09-12T00:00:00Z",
};
const produtos = [base,
  { ...base, id: "site-b", codigo: "SITE-B", nome: "Vacina" },
  { ...base, id: "manual", codigo: "MANUAL", origem: "manual" },
  { ...base, id: "ativo", codigo: "ATIVO", ativo: true },
];
function montar(podeEditar = true) {
  render(<ProdutosClient inicial={produtos} podeEditar={podeEditar}
    textos={{ titulo: "Produtos", subtitulo: "Catálogo", vazio: "Catálogo vazio", vazioDica: "Cadastre" }} />);
}
beforeEach(() => vi.clearAllMocks());

describe("conferência dos preços encontrados no site", () => {
  it("distingue rascunho de produto desativado e oferece confirmação em lote", async () => {
    montar();
    expect(screen.getAllByText("do seu site — confira o preço")).toHaveLength(2);
    expect(screen.getByTestId("produto-SITE-A").querySelector(".line-through")).toBeNull();
    expect(screen.getByTestId("produto-MANUAL").querySelector(".line-through")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar todos" }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith("/api/v1/products/confirmar-site", {
      product_ids: ["site-a", "site-b"],
    }));
  });

  it("a busca limita a confirmação aos rascunhos que a pessoa está vendo", async () => {
    montar();
    fireEvent.change(screen.getByTestId("busca-produto"), { target: { value: "Vacina" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar todos" }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith("/api/v1/products/confirmar-site", {
      product_ids: ["site-b"],
    }));
  });

  it("quem só lê vê o aviso, mas não recebe ação de confirmar", () => {
    montar(false);
    expect(screen.getByTestId("conferencia-produtos-site")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar todos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Confirmar$/ })).not.toBeInTheDocument();
  });

  it("busca vazia não mente que a organização não tem catálogo", () => {
    montar();
    fireEvent.change(screen.getByTestId("busca-produto"), { target: { value: "não existe" } });
    expect(screen.getByText("Nenhum produto corresponde à busca")).toBeInTheDocument();
    expect(screen.queryByText("Catálogo vazio")).not.toBeInTheDocument();
    expect(screen.queryByTestId("conferencia-produtos-site")).not.toBeInTheDocument();
  });
});
