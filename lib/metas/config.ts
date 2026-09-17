import { z } from "zod";

/**
 * Metas são um termômetro operacional, não um placar: a ausência é significativa
 * e nunca é convertida em zero. O json fica em `organizations.settings` para não
 * criar uma tabela sincronizada com dados que já existem no CRM.
 */
const targetSchema = z
  .object({
    monthly_revenue_cents: z.number().int().nonnegative().optional(),
    monthly_conversations: z.number().int().nonnegative().optional(),
  })
  .strict();

export const operationalGoalsSchema = z
  .object({
    /** Moeda da meta monetária; resultados continuam separados por moeda. */
    currency: z.string().regex(/^[A-Z]{3}$/, "Use o código ISO-4217 da moeda.").optional(),
    team: targetSchema.default({}),
    members: z.record(z.string().uuid(), targetSchema).default({}),
  })
  .strict();

export type OperationalGoals = z.infer<typeof operationalGoalsSchema>;
export type OperationalGoalTarget = z.infer<typeof targetSchema>;

export function emptyOperationalGoals(): OperationalGoals {
  return { team: {}, members: {} };
}

/** Leitura defensiva de `organizations.settings.operational_goals`. */
export function operationalGoalsFromSettings(settings: unknown): OperationalGoals {
  const raw =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? (settings as Record<string, unknown>).operational_goals
      : undefined;
  return operationalGoalsSchema.catch(emptyOperationalGoals()).parse(raw ?? {});
}

export type RevenueEvent = {
  user_id: string | null;
  value_cents: number | null;
  currency: string | null;
};

export type ConversationEvent = { user_id: string | null };

export type OperationalProgressRow = {
  user_id: string;
  name: string | null;
  revenue: Array<{ currency: string; current_cents: number; target_cents: number | null }>;
  conversations: { current: number; target: number | null };
};

function revenueFor(
  events: RevenueEvent[],
  userId: string | null,
  goals: OperationalGoals,
  target: OperationalGoalTarget,
) {
  const totals = new Map<string, number>();
  for (const event of events) {
    if (event.user_id !== userId || event.value_cents === null || !event.currency) continue;
    totals.set(event.currency, (totals.get(event.currency) ?? 0) + event.value_cents);
  }

  // Uma meta configurada precisa continuar visível num mês ainda sem vendas.
  if (goals.currency && target.monthly_revenue_cents !== undefined && !totals.has(goals.currency)) {
    totals.set(goals.currency, 0);
  }

  return [...totals.entries()]
    .map(([currency, current_cents]) => ({
      currency,
      current_cents,
      target_cents:
        currency === goals.currency && target.monthly_revenue_cents !== undefined
          ? target.monthly_revenue_cents
          : null,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export function buildOperationalProgress(input: {
  goals: OperationalGoals;
  roster: Array<{ user_id: string; name: string | null }>;
  revenue: RevenueEvent[];
  conversations: ConversationEvent[];
}): { team: Omit<OperationalProgressRow, "user_id" | "name">; members: OperationalProgressRow[] } {
  const { goals, roster, revenue, conversations } = input;
  const teamTarget = goals.team;
  const team = {
    revenue: revenueFor(revenue, null, goals, teamTarget),
    conversations: {
      current: conversations.filter((event) => Boolean(event.user_id)).length,
      target: teamTarget.monthly_conversations ?? null,
    },
  };

  // `revenueFor` por user não atende a equipe: a equipe agrega todos os donos.
  const teamTotals = new Map<string, number>();
  for (const event of revenue) {
    if (!event.user_id || event.value_cents === null || !event.currency) continue;
    teamTotals.set(event.currency, (teamTotals.get(event.currency) ?? 0) + event.value_cents);
  }
  if (goals.currency && teamTarget.monthly_revenue_cents !== undefined && !teamTotals.has(goals.currency)) {
    teamTotals.set(goals.currency, 0);
  }
  team.revenue = [...teamTotals.entries()]
    .map(([currency, current_cents]) => ({
      currency,
      current_cents,
      target_cents:
        currency === goals.currency && teamTarget.monthly_revenue_cents !== undefined
          ? teamTarget.monthly_revenue_cents
          : null,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  return {
    team,
    // A ordem é a do roster, jamais uma ordenação de desempenho.
    members: roster.map((member) => {
      const target = goals.members[member.user_id] ?? {};
      return {
        user_id: member.user_id,
        name: member.name,
        revenue: revenueFor(revenue, member.user_id, goals, target),
        conversations: {
          current: conversations.filter((event) => event.user_id === member.user_id).length,
          target: target.monthly_conversations ?? null,
        },
      };
    }),
  };
}
