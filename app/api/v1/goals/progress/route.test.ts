import { describe, expect, it } from "vitest";

import { buildOperationalProgress, operationalGoalsSchema } from "@/lib/metas/config";
import { utcMonthWindow } from "./route";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("progresso mensal das metas", () => {
  it("usa intervalo UTC semiaberto", () => {
    expect(utcMonthWindow(new Date("2026-02-14T12:00:00Z"))).toEqual({
      from: "2026-02-01T00:00:00.000Z",
      to: "2026-03-01T00:00:00.000Z",
    });
  });

  it("mantém moedas separadas, inclui pessoa do roster sem atividade e não inventa meta", () => {
    const progress = buildOperationalProgress({
      goals: operationalGoalsSchema.parse({
        currency: "BRL",
        team: { monthly_revenue_cents: 500_000 },
        members: { [A]: { monthly_conversations: 5 } },
      }),
      roster: [{ user_id: A, name: "Ana" }, { user_id: B, name: "Bia" }],
      revenue: [
        { user_id: A, value_cents: 120_000, currency: "BRL" },
        { user_id: A, value_cents: 10_000, currency: "USD" },
        // Ganho sem closed_at fica fora antes de chegar a este agregador.
      ],
      conversations: [{ user_id: A }],
    });

    expect(progress.team.revenue).toEqual([
      { currency: "BRL", current_cents: 120_000, target_cents: 500_000 },
      { currency: "USD", current_cents: 10_000, target_cents: null },
    ]);
    expect(progress.members).toEqual(expect.arrayContaining([
      expect.objectContaining({ user_id: B, conversations: { current: 0, target: null } }),
    ]));
    expect(progress.members.map((member) => member.user_id)).toEqual([A, B]);
  });
});
