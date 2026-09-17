import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  role: "manager",
  calls: [] as Array<{ table: string; method: string; column?: string; value?: unknown }>,
  errors: new Set<string>(),
  leads: {
    open: [{ value_cents: 1_234_500, currency: "BRL" }],
    won: [{ value_cents: 456_700, currency: "BRL" }],
  },
}));

vi.mock("@/lib/auth/require-role", () => ({
  requireRole: vi.fn(async () => ({
    ok: true,
    user: { id: "user-a", is_platform_admin: false, idioma: "pt-BR" },
    org: { orgId: "org-a", name: "Org A", role: state.role },
  })),
}));
vi.mock("@/lib/ai/agents/org-tem-automatico", () => ({
  orgTemAutomatico: vi.fn(async () => false),
}));

function resultFor(table: string, filters: Map<string, unknown>, single: boolean) {
  const error = state.errors.has(table) ? { message: `falha em ${table}` } : null;
  if (table === "conversations") {
    const count = filters.has("assigned_to_user_id")
      ? 3
      : filters.has("comando_da_conversa")
        ? 7
        : 19;
    return { data: null, count, error };
  }
  if (table === "crm_tasks") return { data: null, count: 2, error };
  if (table === "user_organizations") return { data: null, count: 4, error };
  if (table === "channel_sessions") {
    return { data: [{ status: "WORKING" }, { status: "FAILED" }], error };
  }
  if (table === "organization_subscriptions") {
    return { data: single ? { plan_id: "completo" } : [{ plan_id: "completo" }], error };
  }
  if (table === "crm_leads") {
    const status = filters.get("status");
    return { data: status === "won" ? state.leads.won : state.leads.open, error };
  }
  return { data: [], error };
}

function query(table: string) {
  const filters = new Map<string, unknown>();
  let single = false;
  const chain = {
    select: (...args: unknown[]) => {
      state.calls.push({ table, method: "select", value: args[0] });
      return chain;
    },
    eq: (column: string, value: unknown) => {
      state.calls.push({ table, method: "eq", column, value });
      filters.set(column, value);
      return chain;
    },
    in: (column: string, value: unknown) => {
      state.calls.push({ table, method: "in", column, value });
      filters.set(column, value);
      return chain;
    },
    is: (column: string, value: unknown) => {
      state.calls.push({ table, method: "is", column, value });
      return chain;
    },
    not: (column: string, value: unknown) => {
      state.calls.push({ table, method: "not", column, value });
      return chain;
    },
    gte: (column: string, value: unknown) => {
      state.calls.push({ table, method: "gte", column, value });
      return chain;
    },
    lt: (column: string, value: unknown) => {
      state.calls.push({ table, method: "lt", column, value });
      return chain;
    },
    maybeSingle: () => {
      single = true;
      return chain;
    },
    then: <T>(onfulfilled: (value: unknown) => T) =>
      Promise.resolve(resultFor(table, filters, single)).then(onfulfilled),
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      state.calls.push({ table, method: "from" });
      return query(table);
    },
    rpc: async () => ({
      data: {
        attendants: [
          { user_id: "user-a", conversations_handled: 12, avg_first_response_seconds: 257 },
        ],
      },
      error: state.errors.has("fn_attendant_metrics") ? { message: "falha em métricas" } : null,
    }),
  })),
}));

import { GET } from "./route";

beforeEach(() => {
  state.role = "manager";
  state.calls = [];
  state.errors = new Set();
  state.leads = {
    open: [{ value_cents: 1_234_500, currency: "BRL" }],
    won: [{ value_cents: 456_700, currency: "BRL" }],
  };
});

async function body() {
  return (await (await GET()).json()) as {
    data: {
      role_surface: string;
      cards: Array<{ id: string }>;
      omitted: Array<{ id: string; reason: string }>;
    };
  };
}

describe("GET /api/v1/dashboard/summary", () => {
  it("agrega somente a organização ativa e soma ganhos fechados no mês sem misturar moedas", async () => {
    const response = await body();

    expect(response.data.role_surface).toBe("manager");
    expect(response.data.cards.map((card) => card.id)).toEqual([
      "pipeline_value",
      "won_revenue",
      "average_ticket",
      "first_response",
      "conversations_per_attendant",
    ]);
    const orgFilters = state.calls.filter((call) => call.column === "organization_id");
    expect(orgFilters).toHaveLength(3);
    expect(orgFilters.every((call) => call.value === "org-a")).toBe(true);
    expect(state.calls.some((call) => call.column === "closed_at" && call.method === "gte")).toBe(
      true,
    );
    expect(state.calls.some((call) => call.column === "closed_at" && call.method === "lt")).toBe(
      true,
    );
  });

  it("omite agregado do pipeline quando as moedas divergem", async () => {
    state.leads.open = [
      { value_cents: 1_234_500, currency: "BRL" },
      { value_cents: 500_00, currency: "USD" },
    ];
    const response = await body();

    expect(response.data.cards.map((card) => card.id)).not.toContain("pipeline_value");
    expect(response.data.omitted).toContainEqual({
      id: "pipeline_value",
      reason: "multiple_currencies",
    });
  });

  it("não consulta receita nem instâncias para a superfície agent", async () => {
    state.role = "agent";
    const response = await body();

    expect(response.data.role_surface).toBe("agent");
    expect(state.calls.some((call) => call.table === "crm_leads")).toBe(false);
    expect(state.calls.some((call) => call.table === "channel_sessions")).toBe(false);
    expect(state.calls.some((call) => call.table === "organization_subscriptions")).toBe(false);
  });

  it("não fabrica uso ou faturamento para admin", async () => {
    state.role = "admin";
    const response = await body();

    expect(response.data.role_surface).toBe("admin");
    expect(response.data.cards.map((card) => card.id)).not.toContain("billing");
    expect(response.data.cards.map((card) => card.id)).not.toContain("usage");
    expect(state.calls.some((call) => call.table === "crm_leads")).toBe(false);
  });

  it("omite apenas o cartão cuja fonte falhou", async () => {
    state.role = "agent";
    state.errors.add("crm_tasks");
    const response = await body();

    expect(response.data.cards.map((card) => card.id)).toContain("first_response");
    expect(response.data.cards.map((card) => card.id)).toContain("assigned_conversations");
    expect(response.data.cards.map((card) => card.id)).not.toContain("overdue_tasks");
  });
});
