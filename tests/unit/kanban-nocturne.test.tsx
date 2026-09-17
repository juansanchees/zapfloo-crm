import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { calculateBoardSummary, totalsByCurrency } from "@/lib/kanban/summary";

describe("quadro Nocturne", () => {
  it("mantém moeda separada no cabeçalho e nas colunas", () => {
    expect(totalsByCurrency([
      { value_cents: 12_500, currency: "BRL" },
      { value_cents: 90, currency: "USD" },
    ])).toEqual({ BRL: 12_500, USD: 90 });

    const summary = calculateBoardSummary([
      { status: "open", value_cents: 12_500, currency: "BRL", closed_at: null },
      { status: "won", value_cents: 90, currency: "USD", closed_at: "2026-09-01T00:00:00Z" },
    ], new Date("2026-09-17T12:00:00Z"));
    expect(summary).toEqual({ open_by_currency: { BRL: 12_500 }, won_month_by_currency: { USD: 90 } });
  });

  it("faz das abas um workspace sem apagar a gestão de funis", () => {
    const source = readFileSync("app/app/kanban/_components/KanbanWorkspace.tsx", "utf8");
    expect(source).toContain('role="tablist"');
    expect(source).toContain("Gerenciar funis");
    expect(source).toContain("<FunisClient");
    expect(source).toContain("router.replace(`/app/kanban?pipeline=");
  });

  it("não promete avanço depois da etapa operacional final e reaproveita a mutação", () => {
    const board = readFileSync("components/kanban/KanbanBoard.tsx", "utf8");
    const actions = readFileSync("components/kanban/KanbanCardActions.tsx", "utf8");
    expect(board).toContain("nextOperationalStageById");
    expect(board).toContain("moveCard.mutate");
    expect(actions).toContain("{onAdvance &&");
    expect(actions).toContain('t("Avançar")');
  });

  it("leva contato honesto e a origem até o card", () => {
    const card = readFileSync("components/kanban/KanbanCard.tsx", "utf8");
    expect(card).toContain("lead.contact?.full_name");
    expect(card).toContain("lead.source");
    expect(card).toContain('t("Sem contato")');
  });
});
