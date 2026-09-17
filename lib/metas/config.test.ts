import { describe, expect, it } from "vitest";

import { emptyOperationalGoals, operationalGoalsSchema } from "./config";

const USER_ID = "00000000-0000-4000-8000-000000000001";

describe("operationalGoalsSchema", () => {
  it("começa sem meta: ausência não significa zero", () => {
    expect(emptyOperationalGoals()).toEqual({ team: {}, members: {} });
    expect(operationalGoalsSchema.parse({})).toEqual({ team: {}, members: {} });
  });

  it("aceita metas de equipe e individuais opcionais", () => {
    const parsed = operationalGoalsSchema.parse({
      currency: "BRL",
      team: { monthly_revenue_cents: 5_000_000, monthly_conversations: 300 },
      members: { [USER_ID]: { monthly_revenue_cents: 800_000, monthly_conversations: 60 } },
    });

    expect(parsed.members[USER_ID]?.monthly_conversations).toBe(60);
    expect(parsed.members[USER_ID]?.monthly_revenue_cents).toBe(800_000);
  });

  it.each([
    { team: { monthly_revenue_cents: 1 } },
    { currency: "EUR", team: { monthly_revenue_cents: 1 } },
    { team: { monthly_revenue_cents: -1 } },
    { team: { monthly_revenue_cents: 1.5 } },
    { team: { monthly_conversations: -1 } },
    { team: { monthly_conversations: 1.5 } },
    { members: { invalid: { monthly_conversations: 2 } } },
  ])("recusa valores ou identificadores inválidos: %o", (input) => {
    expect(operationalGoalsSchema.safeParse(input).success).toBe(false);
  });
});
