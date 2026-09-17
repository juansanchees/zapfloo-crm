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
  pipeline: {
    open_value_by_currency: { BRL: 1234500 },
    won_value_by_currency: { BRL: 456700 },
    won_count_by_currency: { BRL: 4 },
  },
  channels: { online: 2, total: 3 },
  seats: { active: 4, limit: 8 },
};

describe("buildRoleSummary", () => {
  it("projeta a superfície do atendente sem meta diária inventada", () => {
    const summary = buildRoleSummary("agent", sources);

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

    expect(summary.cards.map((card) => card.id)).toEqual([
      "pipeline_value",
      "won_revenue",
      "average_ticket",
      "first_response",
      "conversations_per_attendant",
    ]);
    expect(JSON.stringify(summary)).not.toContain("8940");
  });

  it("não mostra cobrança para admin sem uma fonte canônica", () => {
    const summary = buildRoleSummary("admin", sources);

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
      pipeline: {
        ...sources.pipeline!,
        open_value_by_currency: { BRL: 1234500, USD: 50000 },
      },
    });

    expect(summary.cards.map((card) => card.id)).not.toContain("pipeline_value");
    expect(summary.omitted).toContainEqual({ id: "pipeline_value", reason: "multiple_currencies" });
  });
});
