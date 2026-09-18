import { describe, expect, it } from "vitest";

import { buildOperationalProgress, emptyOperationalGoals, operationalGoalsSchema } from "./config";

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

  it("inclui ganho sem dono na equipe, mas nunca o atribui a uma pessoa", () => {
    const progress = buildOperationalProgress({
      goals: operationalGoalsSchema.parse({ currency: "BRL" }),
      roster: [{ user_id: USER_ID, name: "Ana" }],
      revenue: [
        { user_id: USER_ID, value_cents: 10_000, currency: "BRL" },
        { user_id: null, value_cents: 20_000, currency: "BRL" },
      ],
      conversations: [],
    });

    expect(progress.team.revenue).toEqual([{ currency: "BRL", current_cents: 30_000, target_cents: null }]);
    expect(progress.members[0]!.revenue).toEqual([{ currency: "BRL", current_cents: 10_000, target_cents: null }]);
  });

  it("deduplica conversas respondidas por pessoa e no total da equipe", () => {
    const progress = buildOperationalProgress({
      goals: operationalGoalsSchema.parse({}),
      roster: [{ user_id: USER_ID, name: "Ana" }, { user_id: "00000000-0000-4000-8000-000000000002", name: "Bia" }],
      revenue: [],
      conversations: [
        { user_id: USER_ID, conversation_id: "conversa-1" },
        { user_id: USER_ID, conversation_id: "conversa-1" },
        { user_id: "00000000-0000-4000-8000-000000000002", conversation_id: "conversa-1" },
      ],
    });

    expect(progress.team.conversations.current).toBe(1);
    expect(progress.members.map((member) => member.conversations.current)).toEqual([1, 1]);
  });
});
