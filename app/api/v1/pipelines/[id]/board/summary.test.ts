import { describe, expect, it, vi } from "vitest";

import { calculateBoardSummary } from "@/lib/kanban/summary";

describe("resumo do board", () => {
  it("separa moedas e considera somente ganhos do mês corrente", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-17T12:00:00Z"));

    const summary = calculateBoardSummary([
      { status: "open", value_cents: 125_000, currency: "BRL", closed_at: null },
      { status: "won", value_cents: 42_000, currency: "BRL", closed_at: "2026-09-03T10:00:00Z" },
      { status: "won", value_cents: 9_000, currency: "USD", closed_at: "2026-09-05T10:00:00Z" },
      { status: "won", value_cents: 1_000, currency: "BRL", closed_at: "2026-09-01T00:00:00Z" },
      { status: "won", value_cents: 99_000, currency: "BRL", closed_at: "2026-08-31T23:59:59Z" },
      { status: "won", value_cents: 88_000, currency: "BRL", closed_at: "2026-10-01T00:00:00Z" },
      { status: "lost", value_cents: 50_000, currency: "BRL", closed_at: "2026-09-10T10:00:00Z" },
    ]);

    expect(summary.open_by_currency.BRL).toBe(125000);
    expect(summary.won_month_by_currency.BRL).toBe(43000);
    expect(summary.won_month_by_currency.USD).toBe(9000);
    expect(summary.won_month_by_currency).not.toHaveProperty("EUR");

    vi.useRealTimers();
  });
});
