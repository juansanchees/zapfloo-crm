import { describe, expect, it } from "vitest";

import { buildRoleSummary, type DashboardSources } from "./role-summary";

const sources: DashboardSources = {
  conversation_counts: { fila: 7, mine: 3, all: 19 },
  open_tasks: { overdue: 2 },
  attendants: {
    first_response_seconds: 257,
    conversations_handled: 12,
    attendant_count: 3,
  },
  pipeline_open: {
    value_by_currency: { BRL: 1234500 },
  },
  won_revenue: {
    value_by_currency: { BRL: 456700 },
    count_by_currency: { BRL: 4 },
  },
  channels: { online: 2, total: 3 },
  seats: { active: 4, limit: 8 },
};

describe("buildRoleSummary", () => {
  it("projeta a superfície do atendente sem meta diária inventada", () => {
    const summary = buildRoleSummary("agent", sources);

    expect(summary.hero.label).toBe("Na fila agora");
    expect(summary.hero.value).toBe(7);
    expect(summary.cards.map((card) => card.id)).toEqual([
      "first_response",
      "assigned_conversations",
      "overdue_tasks",
    ]);
    expect(summary.cards.map((card) => card.id)).not.toContain("daily_goal");
  });

  it("mantém as métricas operacionais do gerente e não carrega faturamento estranho", () => {
    const legacyPayload = { ...sources, billing_cents: 8940 };
    const summary = buildRoleSummary("manager", legacyPayload);

    expect(summary.hero.label).toBe("Valor do pipeline");
    expect(summary.hero.value).toBe("R$ 12.345");
    expect(summary.cards.map((card) => card.id)).toEqual([
      "won_revenue",
      "average_ticket",
      "first_response",
      "conversations_per_attendant",
    ]);
    expect(summary.cards.map((card) => card.id)).not.toContain("pipeline_value");
    expect(JSON.stringify(summary)).not.toContain("8940");
    expect(summary.hero.hint).toBe("Valor informado das oportunidades abertas.");
  });

  it("não mostra cobrança para admin sem uma fonte canônica", () => {
    const summary = buildRoleSummary("admin", sources);

    expect(summary.hero.label).toBe("Instâncias online");
    expect(summary.hero.value).toBe("2/3");
    expect(summary.cards.map((card) => card.id)).not.toContain("online_instances");
    expect(summary.cards.map((card) => card.id)).not.toContain("billing");
    expect(summary.cards.map((card) => card.id)).not.toContain("usage");
  });

  it("omite a métrica quando sua fonte não foi lida, em vez de inventar zero", () => {
    const summary = buildRoleSummary("agent", {
      ...sources,
      open_tasks: undefined,
    });

    expect(summary.cards.map((card) => card.id)).not.toContain("overdue_tasks");
    expect(summary.omitted).toContainEqual({ id: "overdue_tasks", reason: "source_unavailable" });
  });

  it("não soma valores de moedas diferentes", () => {
    const summary = buildRoleSummary("manager", {
      ...sources,
      pipeline_open: {
        value_by_currency: { BRL: 1234500, USD: 50000 },
      },
    });

    expect(summary.hero).toMatchObject({ id: "pipeline", label: "Valor do pipeline", value: "—" });
    expect(summary.omitted).toContainEqual({ id: "pipeline", reason: "multiple_currencies" });
  });

  it("não chama bucket vazio de múltiplas moedas", () => {
    const summary = buildRoleSummary("manager", {
      ...sources,
      pipeline_open: { value_by_currency: {} },
    });

    expect(summary.omitted).toContainEqual({ id: "pipeline", reason: "source_unavailable" });
    expect(summary.omitted).not.toContainEqual({
      id: "pipeline",
      reason: "multiple_currencies",
    });
  });

  it("mantém a convenção da moeda quando o leitor troca o idioma da interface", () => {
    const summary = buildRoleSummary("manager", { ...sources, locale: "es" });
    expect(summary.hero.value).toBe("R$ 12.345");
  });

  it("formata MXN pela convenção mexicana no painel", () => {
    const summary = buildRoleSummary("manager", {
      ...sources,
      locale: "pt-BR",
      pipeline_open: { value_by_currency: { MXN: 1_234_500 } },
    });

    expect(summary.hero.value).toBe("$12,345");
  });
});
