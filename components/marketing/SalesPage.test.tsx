import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PLANOS, formatarPrecoMensal } from "@/lib/billing/planos";
import { SalesPage, type PlanosDaPagina } from "./SalesPage";

describe("página pública de vendas", () => {
  it("lê preços e limites do catálogo central de planos", () => {
    render(<SalesPage />);

    for (const [id, plano] of Object.entries(PLANOS)) {
      const card = screen.getByTestId(`plano-${id}`);
      expect(within(card).getByText(plano.nome)).toBeInTheDocument();
      expect(card.textContent?.replace(/\u00a0/g, " ")).toContain(
        formatarPrecoMensal(plano.precoMensalCents).replace(/\u00a0/g, " "),
      );
    }
    expect(within(screen.getByTestId("plano-completo")).getByText("Funis sem limite")).toBeInTheDocument();
  });

  it("mudar o preço na configuração recebida muda a página sem editar o JSX", () => {
    const alterados: PlanosDaPagina = {
      ...PLANOS,
      basico: { ...PLANOS.basico, precoMensalCents: 12_300 },
    };
    render(<SalesPage planos={alterados} />);

    const card = screen.getByTestId("plano-basico");
    expect(card.textContent?.replace(/\u00a0/g, " ")).toContain("R$ 123");
    expect(card.textContent?.replace(/\u00a0/g, " ")).not.toContain("R$ 97");
  });

  it("só mostra o botão de WhatsApp quando há número configurado", () => {
    const { rerender } = render(<SalesPage />);
    expect(screen.queryByRole("link", { name: "Falar pelo WhatsApp" })).not.toBeInTheDocument();

    rerender(<SalesPage whatsappNumber="+55 (11) 99999-0000" />);
    expect(screen.getByRole("link", { name: "Falar pelo WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/5511999990000",
    );
  });

  it("não inventa prova social", () => {
    render(<SalesPage />);
    expect(document.body.textContent).not.toMatch(/depoimento|clientes atendidos|mais de \d+/i);
  });
});
