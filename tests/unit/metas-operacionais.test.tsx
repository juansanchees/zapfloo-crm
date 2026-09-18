import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { MetasClient } from "@/app/app/metas/_components/MetasClient";

let progress: {
  window: { from: string; to: string };
  scope: "team" | "self";
  team: { revenue: Array<{ currency: string; current_cents: number; target_cents: number | null }>; conversations: { current: number; target: number | null } };
  members: Array<{ user_id: string; name: string; revenue: Array<{ currency: string; current_cents: number; target_cents: number | null }>; conversations: { current: number; target: number | null } }>;
} = {
  window: { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" },
  scope: "team",
  team: {
    revenue: [{ currency: "BRL", current_cents: 125_000, target_cents: 500_000 }],
    conversations: { current: 12, target: null },
  },
  members: [{
    user_id: "11111111-1111-4111-8111-111111111111",
    name: "Ana",
    revenue: [{ currency: "BRL", current_cents: 125_000, target_cents: 200_000 }],
    conversations: { current: 12, target: 30 },
  }],
};
const goals = { data: { currency: "BRL", team: { monthly_revenue_cents: 500_000 }, members: {} } };

vi.mock("@/hooks/metas/useGoals", () => ({
  useGoals: () => ({
    isLoading: false,
    isError: false,
    data: goals,
  }),
  useUpdateGoals: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/metas/useGoalProgress", () => ({
  useGoalProgress: () => ({ isLoading: false, isError: false, data: { data: progress } }),
}));

afterEach(cleanup);

describe("Metas operacionais", () => {
  it("oferece configuração apenas a manager/admin e apresenta valores reais", () => {
    render(<MetasClient canManage orgId="org-a" userId="user-a" role="manager" />);

    expect(screen.getByRole("heading", { name: "Configurar metas" })).toBeVisible();
    expect(screen.getAllByText("Ana").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/R\$\s*1\.250,00/).length).toBeGreaterThan(0);
    expect(screen.getByText("12 · Meta não definida")).toBeVisible();
  });

  it("mantém agente em leitura e não apresenta linguagem de competição", () => {
    render(<MetasClient canManage={false} orgId="org-a" userId="user-a" role="agent" />);

    expect(screen.queryByRole("heading", { name: "Configurar metas" })).toBeNull();
    expect(screen.getByText("Ana")).toBeVisible();
    const text = document.body.textContent?.toLowerCase() ?? "";
    for (const forbidden of ["xp", "ranking", "troféu", "prêmio", "competição", "nível", "ofensiva", "desafio", "ponto", "medalha"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("mostra self e ausência monetária sem inventar moeda ou zero", () => {
    progress = { ...progress, scope: "self", team: { revenue: [], conversations: { current: 1, target: 7 } } };
    render(<MetasClient canManage={false} orgId="org-b" userId="user-a" role="agent" />);
    expect(screen.getByRole("heading", { name: "Seu resumo" })).toBeVisible();
    expect(screen.getByText("Receita mensal: Meta não definida")).toBeVisible();
    expect(document.body.textContent).not.toContain("R$ 0");
  });
});
