import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  role: "manager",
  idioma: "pt-BR",
  authorized: true,
  requiredRole: "",
  calls: [] as Array<{ table: string; method: string; column?: string; value?: unknown }>,
  errors: new Set<string>(),
  failLeadStatus: null as "open" | "won" | null,
  countOverride: undefined as number | null | undefined,
  channelData: [{ status: "WORKING" }, { status: "FAILED" }] as Array<{ status: string }> | null,
  subscription: { plan_id: "completo", status: "ativo" },
  attendants: [
    { user_id: "user-a", conversations_handled: 12, avg_first_response_seconds: 257 },
  ] as Array<{
    user_id: string;
    conversations_handled: number;
    avg_first_response_seconds: number | null;
  }>,
  leads: {
    open: [{ value_cents: 1_234_500, currency: "BRL" }],
    won: [
      { value_cents: 114_200, currency: "BRL" },
      { value_cents: 114_200, currency: "BRL" },
      { value_cents: 114_200, currency: "BRL" },
      { value_cents: 114_100, currency: "BRL" },
    ],
  },
}));

vi.mock("@/lib/auth/require-role", () => ({
  requireRole: vi.fn(async (min: string) => {
    state.requiredRole = min;
    if (!state.authorized) return { ok: false, response: new Response(null, { status: 403 }) };
    return {
      ok: true,
      user: { id: "user-a", is_platform_admin: false, idioma: state.idioma },
      org: { orgId: "org-a", name: "Org A", role: state.role },
    };
  }),
}));
vi.mock("@/lib/ai/agents/org-tem-automatico", () => ({
  orgTemAutomatico: vi.fn(async () => false),
}));

function resultFor(table: string, filters: Map<string, unknown>, single: boolean) {
  const error =
    state.errors.has(table) ||
    (table === "crm_leads" && filters.get("status") === state.failLeadStatus)
      ? { message: `falha em ${table}` }
      : null;
  if (table === "conversations") {
    const count = filters.has("assigned_to_user_id")
      ? 3
      : filters.has("comando_da_conversa")
        ? 7
        : 19;
    return {
      data: null,
      count: state.countOverride === undefined ? count : state.countOverride,
      error,
    };
  }
  if (table === "crm_tasks")
    return {
      data: null,
      count: state.countOverride === undefined ? 2 : state.countOverride,
      error,
    };
  if (table === "user_organizations") return { data: null, count: 4, error };
  if (table === "channel_sessions") {
    return { data: state.channelData, error };
  }
  if (table === "organization_subscriptions") {
    return { data: single ? state.subscription : [state.subscription], error };
  }
  if (table === "organizations")
    return { data: single ? { created_at: "2026-09-01T00:00:00.000Z" } : [], error };
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
        attendants: state.attendants,
      },
      error: state.errors.has("fn_attendant_metrics") ? { message: "falha em métricas" } : null,
    }),
  })),
}));

import { GET } from "./route";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-17T12:00:00.000Z"));
  state.role = "manager";
  state.idioma = "pt-BR";
  state.authorized = true;
  state.requiredRole = "";
  state.calls = [];
  state.errors = new Set();
  state.failLeadStatus = null;
  state.countOverride = undefined;
  state.channelData = [{ status: "WORKING" }, { status: "FAILED" }];
  state.subscription = { plan_id: "completo", status: "ativo" };
  state.attendants = [
    { user_id: "user-a", conversations_handled: 12, avg_first_response_seconds: 257 },
  ];
  state.leads = {
    open: [{ value_cents: 1_234_500, currency: "BRL" }],
    won: [
      { value_cents: 114_200, currency: "BRL" },
      { value_cents: 114_200, currency: "BRL" },
      { value_cents: 114_200, currency: "BRL" },
      { value_cents: 114_100, currency: "BRL" },
    ],
  };
});

afterEach(() => vi.useRealTimers());

async function body() {
  return (await (await GET()).json()) as {
    data: {
      role_surface: string;
      hero: { value: string | number };
      cards: Array<{ id: string; value: string | number }>;
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
    expect(orgFilters).toHaveLength(2);
    expect(orgFilters.every((call) => call.value === "org-a")).toBe(true);
    expect(state.calls.some((call) => call.column === "closed_at" && call.method === "gte")).toBe(
      true,
    );
    expect(state.calls.some((call) => call.column === "closed_at" && call.method === "lt")).toBe(
      true,
    );
    expect(response.data.cards.find((card) => card.id === "won_revenue")?.value).toBe("R$ 4.567");
    expect(response.data.cards.find((card) => card.id === "average_ticket")?.value).toBe(
      "R$ 1.142",
    );
    expect(state.calls).toContainEqual({
      table: "crm_leads",
      method: "gte",
      column: "closed_at",
      value: "2026-09-01T00:00:00.000Z",
    });
    expect(state.calls).toContainEqual({
      table: "crm_leads",
      method: "lt",
      column: "closed_at",
      value: "2026-10-01T00:00:00.000Z",
    });
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

  it("nega viewer antes de consultar qualquer métrica", async () => {
    state.role = "viewer";
    state.authorized = false;
    const response = await GET();

    expect(response.status).toBe(403);
    expect(state.requiredRole).toBe("agent");
    expect(state.calls).toHaveLength(0);
  });

  it("mantém zero explícito, mas omite contagens nulas", async () => {
    state.role = "agent";
    state.countOverride = 0;
    const zero = await body();
    expect(zero.data.hero.value).toBe(0);
    expect(zero.data.cards.find((card) => card.id === "overdue_tasks")?.value).toBe(0);

    state.countOverride = null;
    const absent = await body();
    expect(absent.data.hero.value).toBe("—");
    expect(absent.data.cards.map((card) => card.id)).not.toContain("overdue_tasks");
  });

  it("não fabrica uso ou faturamento para admin", async () => {
    state.role = "admin";
    const response = await body();

    expect(response.data.role_surface).toBe("admin");
    expect(response.data.cards.map((card) => card.id)).not.toContain("billing");
    expect(response.data.cards.map((card) => card.id)).not.toContain("usage");
    expect(state.calls.some((call) => call.table === "crm_leads")).toBe(false);
  });

  it("aceita lista de canais vazia, mas omite canais quando a resposta não traz dados", async () => {
    state.role = "admin";
    state.channelData = [];
    const empty = await body();
    expect(empty.data.cards.find((card) => card.id === "online_instances")?.value).toBe("0/0");

    state.channelData = null;
    const absent = await body();
    expect(absent.data.cards.map((card) => card.id)).not.toContain("online_instances");
  });

  it("resolve assentos pelo plano de recursos durante o teste", async () => {
    state.role = "admin";
    state.subscription = { plan_id: "basico", status: "teste" };
    const response = await body();
    expect(response.data.cards.find((card) => card.id === "active_seats")?.value).toBe("4/10");
  });

  it.each(["ativo", "pausado"] as const)(
    "usa o plano contratado para assentos quando a assinatura está %s",
    async (status) => {
      state.role = "admin";
      state.subscription = { plan_id: "basico", status };
      const response = await body();
      expect(response.data.cards.find((card) => card.id === "active_seats")?.value).toBe("4/1");
    },
  );

  it("preserva fonte monetária independente quando a outra falha", async () => {
    state.failLeadStatus = "won";
    const withoutWon = await body();
    expect(withoutWon.data.cards.map((card) => card.id)).toContain("pipeline_value");
    expect(withoutWon.data.cards.map((card) => card.id)).not.toContain("won_revenue");

    state.failLeadStatus = "open";
    const withoutOpen = await body();
    expect(withoutOpen.data.cards.map((card) => card.id)).not.toContain("pipeline_value");
    expect(withoutOpen.data.cards.map((card) => card.id)).toContain("won_revenue");
  });

  it("divide conversas apenas por atendentes com conversa atribuída no período", async () => {
    state.attendants = [
      { user_id: "agent-1", conversations_handled: 12, avg_first_response_seconds: 100 },
      { user_id: "viewer-1", conversations_handled: 0, avg_first_response_seconds: null },
    ];
    const response = await body();
    expect(
      response.data.cards.find((card) => card.id === "conversations_per_attendant")?.value,
    ).toBe("12.0");
  });

  it("formata moeda conforme o idioma da pessoa", async () => {
    state.idioma = "es";
    const response = await body();
    expect(response.data.cards.find((card) => card.id === "pipeline_value")?.value).toBe(
      "12.345 BRL",
    );
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
