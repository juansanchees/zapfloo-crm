import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildOperationalProgress, operationalGoalsSchema } from "@/lib/metas/config";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";
import { nomesDosAtendentes } from "@/lib/users/nome-do-atendente";
import { GET, utcMonthWindow } from "./route";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/users/nome-do-atendente", () => ({ nomesDosAtendentes: vi.fn(async () => new Map()) }));
vi.mock("@/lib/webhooks/secrets", () => ({ decryptWebhookSecret: vi.fn() }));

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  const now = new Date(); const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const before = new Date(from.getTime() - 1).toISOString(); const inside = new Date(from.getTime() + 86_400_000).toISOString(); const after = new Date(to.getTime() + 1).toISOString();
  vi.mocked(requireRole).mockResolvedValue({ ok: true, user: { id: A, is_platform_admin: false }, org: { orgId: "org-a", role: "agent" } } as never);
  vi.mocked(decryptWebhookSecret).mockResolvedValue(null);
  const calls: Array<{
    table: string;
    filters: Array<[string, unknown]>;
    ops: Array<{ op: string; key: string; value: unknown }>;
  }> = [];
  const rows: Record<string, Array<Record<string, unknown>>> = {
    organizations: [{ id: "org-a", settings: { operational_goals: { currency: "BRL", team: { monthly_revenue_cents: 500_000 } } } }],
    user_organizations: [{ organization_id: "org-a", user_id: A, revoked_at: null, accepted_at: "2026-01-01" }, { organization_id: "org-a", user_id: B, revoked_at: null, accepted_at: "2026-01-01" }],
    crm_leads: ([before, from.toISOString(), inside, to.toISOString(), after, null].map((closed_at, i) => ({ organization_id: "org-a", owner_user_id: A, value_cents: 10_000 * (i + 1), currency: "BRL", status: "won", closed_at })) as Array<Record<string, unknown>>).concat([
      { organization_id: "org-a", owner_user_id: null, value_cents: 100_000, currency: "BRL", status: "won", closed_at: inside },
      { organization_id: "org-a", owner_user_id: A, value_cents: 99_000, currency: "BRL", status: "lost", closed_at: inside },
      { organization_id: "org-b", owner_user_id: A, value_cents: 77_000, currency: "BRL", status: "won", closed_at: inside },
    ]),
    messages: ([before, from.toISOString(), inside, to.toISOString(), after, null].map((sent_at, i) => ({
      organization_id: "org-a", direction: "outbound", sent_by_user_id: A, sent_at,
      conversation_id: i === 1 ? "from" : i === 2 ? "shared" : `outside-${i}`,
    })) as Array<Record<string, unknown>>).concat([
      { organization_id: "org-a", direction: "outbound", sent_by_user_id: A, sent_at: inside, conversation_id: "shared" },
      { organization_id: "org-a", direction: "outbound", sent_by_user_id: B, sent_at: inside, conversation_id: "shared" },
      { organization_id: "org-a", direction: "outbound", sent_by_user_id: null, sent_at: inside, conversation_id: "bot" },
      { organization_id: "org-a", direction: "inbound", sent_by_user_id: null, sent_at: inside, conversation_id: "inbound" },
      { organization_id: "org-b", direction: "outbound", sent_by_user_id: A, sent_at: inside, conversation_id: "other-org" },
    ]),
  };
  class Q implements PromiseLike<unknown> {
    filters: Array<[string, unknown]> = []; ops: Array<{ op: string; key: string; value: unknown }> = [];
    constructor(readonly table: string) { calls.push({ table, filters: this.filters, ops: this.ops }); }
    select() { return this; } eq(k: string, v: unknown) { this.filters.push([k, v]); this.ops.push({op:"eq",key:k,value:v}); return this; }
    gte(k: string, v: unknown) { this.filters.push([k, v]); this.ops.push({op:"gte",key:k,value:v}); return this; } lt(k: string, v: unknown) { this.filters.push([k, v]); this.ops.push({op:"lt",key:k,value:v}); return this; }
    is(k: string, v: unknown) { this.filters.push([k, v]); return this; } not(k: string, operator: string, v: unknown) { this.ops.push({op:`not.${operator}`,key:k,value:v}); return this; } order() { return this; } maybeSingle() { return this; }
    then<TResult1 = unknown, TResult2 = never>(onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> { const found = (rows[this.table] ?? []).filter((row) => this.ops.every(({op,key,value}) => op === "eq" ? row[key] === value : op === "gte" ? typeof value === "string" && typeof row[key] === "string" && row[key] >= value : op === "lt" ? typeof value === "string" && typeof row[key] === "string" && row[key] < value : row[key] !== value)); return Promise.resolve({ data: this.table === "organizations" ? (found[0] ?? null) : found, error: null }).then(onfulfilled, onrejected); }
  }
  vi.mocked(createClient).mockResolvedValue({ from: (table: string) => new Q(table) } as never);
  (globalThis as typeof globalThis & { __goalCalls?: typeof calls }).__goalCalls = calls;
});

describe("progresso mensal das metas", () => {
  it("executa GET com tenant, won, janela UTC e recorte self", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json() as { data: { scope: string; window: { from: string; to: string }; members: Array<{ user_id: string; revenue: Array<{ current_cents: number }>; conversations: { current: number } }> } };
    expect(body.data.scope).toBe("self");
    expect(body.data.members).toHaveLength(1);
    expect(body.data.members[0]!.user_id).toBe(A);
    expect(body.data.members[0]!.revenue[0]!.current_cents).toBe(50_000);
    expect(body.data.members[0]!.conversations.current).toBe(2);
    const calls = (globalThis as typeof globalThis & { __goalCalls: Array<{ table: string; filters: Array<[string, unknown]>; ops: Array<{ op: string; key: string; value: unknown }> }> }).__goalCalls;
    const leads = calls.find((call) => call.table === "crm_leads")!;
    expect(leads.filters).toEqual(expect.arrayContaining([["organization_id", "org-a"], ["status", "won"], ["owner_user_id", A], ["closed_at", expect.any(String)]]));
    const messages = calls.find((call) => call.table === "messages")!;
    expect(messages.filters).toEqual(expect.arrayContaining([["organization_id", "org-a"], ["direction", "outbound"], ["sent_by_user_id", A]]));
    expect(leads.ops).toEqual(expect.arrayContaining([
      { op: "gte", key: "closed_at", value: body.data.window.from },
      { op: "lt", key: "closed_at", value: body.data.window.to },
    ]));
    expect(messages.ops).toEqual(expect.arrayContaining([
      { op: "not.is", key: "sent_by_user_id", value: null },
      { op: "gte", key: "sent_at", value: body.data.window.from },
      { op: "lt", key: "sent_at", value: body.data.window.to },
    ]));
  });
  it("self usa target individual cifrado, nunca o target da equipe", async () => {
    // O fixture anterior não precisa de cifra; aqui forçamos a divergência que
    // uma regressão para goals.team deixaria visível.
    vi.mocked(decryptWebhookSecret).mockResolvedValue(JSON.stringify({
      [A]: { monthly_revenue_cents: 100_000, monthly_conversations: 4 },
      [B]: { monthly_revenue_cents: 900_000, monthly_conversations: 99 },
    }));
    // O dublê de organizações é fechado no beforeEach; substituí-lo por um
    // client mínimo mantém a rota real e faz members_enc chegar ao decrypt.
    const base = await vi.mocked(createClient)();
    const originalFrom = (base as { from: (table: string) => unknown }).from;
    vi.mocked(createClient).mockResolvedValue({ from: (table: string) => {
      const q = originalFrom(table) as { select: () => unknown };
      if (table !== "organizations") return q;
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { settings: { operational_goals: { currency: "BRL", team: { monthly_revenue_cents: 500_000 }, members_enc: "x" } } }, error: null }) }) }) };
    } } as never);
    const body = await (await GET()).json() as { data: { team: { revenue: Array<{ target_cents: number | null }>; conversations: { target: number | null } }; members: Array<{ user_id: string; revenue: Array<{ target_cents: number | null }> }> } };
    expect(body.data.team.revenue[0]!.target_cents).toBe(100_000);
    expect(body.data.team.conversations.target).toBe(4);
    expect(body.data.members).toHaveLength(1);
    expect(body.data.members[0]!.user_id).toBe(A);
    expect(body.data.members[0]!.revenue[0]!.target_cents).toBe(100_000);
  });
  it.each(["manager", "admin"] as const)("%s recebe roster nominal sem filtros individuais", async (role) => {
    vi.mocked(requireRole).mockResolvedValue({ ok: true, user: { id: A, is_platform_admin: false }, org: { orgId: "org-a", role } } as never);
    vi.mocked(nomesDosAtendentes).mockResolvedValue(new Map([[A, "Ana"], [B, "Bia"]]));
    const body = await (await GET()).json() as { data: { scope: string; team: { revenue: Array<{ current_cents: number }>; conversations: { current: number } }; members: Array<{ user_id: string; name: string | null; conversations: { current: number } }> } };
    expect(body.data.scope).toBe("team");
    expect(body.data.members).toEqual(expect.arrayContaining([{ user_id: A, name: "Ana", revenue: expect.any(Array), conversations: expect.any(Object) }, { user_id: B, name: "Bia", revenue: expect.any(Array), conversations: expect.any(Object) }]));
    expect(body.data.team.revenue[0]!.current_cents).toBe(150_000);
    expect(body.data.team.conversations.current).toBe(2);
    expect(body.data.members.map((member) => member.conversations.current)).toEqual([2, 1]);
    const calls = (globalThis as typeof globalThis & { __goalCalls: Array<{ table: string; filters: Array<[string, unknown]> }> }).__goalCalls;
    expect(calls.find((call) => call.table === "crm_leads")!.filters.map(([key]) => key)).not.toContain("owner_user_id");
    expect(calls.find((call) => call.table === "messages")!.filters.map(([key]) => key)).not.toContain("sent_by_user_id");
  });
  it("platform admin com papel agent recebe o mesmo escopo completo", async () => {
    vi.mocked(requireRole).mockResolvedValue({ ok: true, user: { id: A, is_platform_admin: true }, org: { orgId: "org-a", role: "agent" } } as never);

    const body = await (await GET()).json() as { data: { scope: string; members: Array<{ user_id: string }> } };
    expect(body.data.scope).toBe("team");
    expect(body.data.members.map((member) => member.user_id)).toEqual([A, B]);
    expect(requireRole).toHaveBeenCalledWith("agent", expect.objectContaining({ allowPlatformAdmin: true }));
    const calls = (globalThis as typeof globalThis & { __goalCalls: Array<{ table: string; filters: Array<[string, unknown]> }> }).__goalCalls;
    expect(calls.find((call) => call.table === "crm_leads")!.filters.map(([key]) => key)).not.toContain("owner_user_id");
    expect(calls.find((call) => call.table === "messages")!.filters.map(([key]) => key)).not.toContain("sent_by_user_id");
  });
  it("recusa progresso quando a cifra individual não pode ser decifrada", async () => {
    const base = await vi.mocked(createClient)();
    const originalFrom = (base as { from: (table: string) => unknown }).from;
    vi.mocked(createClient).mockResolvedValue({ from: (table: string) => {
      const q = originalFrom(table) as { select: () => unknown };
      if (table !== "organizations") return q;
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { settings: { operational_goals: { currency: "BRL", members_enc: "corrupted" } } }, error: null }) }) }) };
    } } as never);

    const response = await GET();
    expect(response.status).toBe(500);
    const body = await response.json() as { data?: unknown; error: { code: string } };
    expect(body.error.code).toBe("internal_error");
    expect(body.data).toBeUndefined();
  });
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
      conversations: [{ user_id: A, conversation_id: "conversa-a" }],
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
