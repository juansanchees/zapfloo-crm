import type { Lead } from "@/lib/types/leads";

export type CurrencyTotals = Record<string, number>;

/**
 * Soma valores sem converter moedas. Uma soma entre BRL e USD parece um total,
 * mas não é uma informação financeira utilizável.
 */
export function totalsByCurrency(leads: Iterable<Pick<Lead, "value_cents" | "currency">>): CurrencyTotals {
  const totals: CurrencyTotals = {};
  for (const lead of leads) {
    if (lead.value_cents == null || !lead.currency) continue;
    totals[lead.currency] = (totals[lead.currency] ?? 0) + lead.value_cents;
  }
  return totals;
}

export type BoardSummaryInput = Pick<Lead, "status" | "value_cents" | "currency" | "closed_at">;

export interface BoardSummary {
  open_by_currency: CurrencyTotals;
  won_month_by_currency: CurrencyTotals;
}

/** O resumo do quadro é puro para o mês e o relógio serem testáveis. */
export function calculateBoardSummary(
  leads: Iterable<BoardSummaryInput>,
  now = new Date(),
): BoardSummary {
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startOfNextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const open: BoardSummaryInput[] = [];
  const wonThisMonth: BoardSummaryInput[] = [];

  for (const lead of leads) {
    if (lead.status === "open") open.push(lead);
    if (
      lead.status === "won" &&
      lead.closed_at !== null &&
      new Date(lead.closed_at).getTime() >= startOfMonth.getTime() &&
      new Date(lead.closed_at).getTime() < startOfNextMonth.getTime()
    ) {
      wonThisMonth.push(lead);
    }
  }

  return {
    open_by_currency: totalsByCurrency(open),
    won_month_by_currency: totalsByCurrency(wonThisMonth),
  };
}
