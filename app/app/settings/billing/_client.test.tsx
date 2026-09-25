import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BillingClient, type BillingClientProps } from "./_client";

const base: BillingClientProps = {
  idioma: "pt-BR",
  assinatura: {
    plan_id: "essencial",
    status: "ativo",
    access_until: "2026-10-27T12:00:00.000Z",
    paid_through: "2026-10-24T12:00:00.000Z",
  },
  acesso: {
    allowed: true,
    reason: "subscription_active",
    accessUntil: "2026-10-27T12:00:00.000Z",
    enforcementEnabled: true,
  },
  podeComprar: true,
  checkouts: {
    basico: "https://app.monetizze.com.br/checkout/BASICO?email=dona%40example.com&src=opaco.assinado",
    essencial: "https://app.monetizze.com.br/checkout/ESSENCIAL?email=dona%40example.com&src=opaco.assinado",
    completo: null,
  },
};

afterEach(cleanup);

describe("Plano e pagamentos", () => {
  it("mostra a assinatura real, validade e os limites vindos do catálogo", () => {
    const { container } = render(<BillingClient {...base} />);

    expect(screen.getByRole("heading", { name: "Plano e pagamentos" })).toBeVisible();
    expect(screen.getAllByText("Essencial")).toHaveLength(2);
    expect(screen.getByText("Ativo")).toBeVisible();
    expect(screen.getAllByText(/27 de outubro de 2026/)).toHaveLength(2);
    expect(screen.getAllByText("3 pessoas da equipe")).toHaveLength(2);
    expect(screen.getAllByText("2 funis de vendas")).toHaveLength(2);
    expect(container.textContent).toMatch(/R\$\s*197\/mês/);
  });

  it.each([
    ["trial_active", "Teste ativo"],
    ["subscription_active", "Assinatura em dia"],
    ["grace_period", "Pagamento pendente"],
    ["subscription_expired", "Acesso bloqueado"],
    ["paused", "Acesso bloqueado"],
  ] as const)("explica o motivo comercial %s sem código técnico", (reason, texto) => {
    render(
      <BillingClient
        {...base}
        acesso={{ ...base.acesso, reason, allowed: !["subscription_expired", "paused"].includes(reason) }}
      />,
    );
    expect(screen.getByText(texto)).toBeVisible();
    expect(screen.queryByText(reason)).toBeNull();
  });

  it.each([
    ["teste", "Em teste"],
    ["ativo", "Ativo"],
    ["recusado", "Pagamento recusado"],
    ["cancelado", "Cancelado"],
    ["pausado", "Pausado"],
  ] as const)("mostra a situação real %s", (status, rotulo) => {
    render(<BillingClient {...base} assinatura={{ ...base.assinatura, status }} />);
    expect(screen.getByText(rotulo)).toBeVisible();
  });

  it("não produz link quebrado quando o checkout de um plano não está configurado", () => {
    render(<BillingClient {...base} />);

    expect(screen.getByRole("link", { name: "Escolher Básico" })).toHaveAttribute(
      "href",
      expect.stringContaining("app.monetizze.com.br"),
    );
    expect(screen.queryByRole("link", { name: "Escolher Completo" })).toBeNull();
    expect(screen.getByRole("button", { name: "Checkout do plano Completo indisponível" })).toBeDisabled();
    expect(screen.getByText("Compra indisponível nesta instalação")).toBeVisible();
  });

  it("mostra a situação para um membro sem expor checkout reservado ao administrador", () => {
    const { container } = render(
      <BillingClient
        {...base}
        podeComprar={false}
        checkouts={{ basico: null, essencial: null, completo: null }}
      />,
    );

    expect(screen.getByText("Peça a um administrador da empresa para contratar ou trocar o plano.")).toBeVisible();
    expect(screen.queryByRole("link", { name: /Escolher/ })).toBeNull();
    expect(container.innerHTML).not.toContain("email=");
    expect(container.innerHTML).not.toContain("src=");
  });

  it("não renderiza UUID nem segredo no HTML", () => {
    const { container } = render(<BillingClient {...base} />);
    expect(container.innerHTML).not.toContain("11111111-1111-4111-8111-111111111111");
    expect(container.innerHTML).not.toContain("MONETIZZE_CHAVE_UNICA");
    expect(container.innerHTML).not.toContain("segredo-monetizze");
  });

  it("fica utilizável em viewport estreita sem largura mínima rígida", () => {
    const { container } = render(<BillingClient {...base} />);
    expect(container.querySelector("[data-testid='billing-plan-grid']")).toHaveClass(
      "grid-cols-1",
    );
    expect(container.querySelector("[data-testid='billing-page']")).toHaveClass("min-w-0");
  });
});
