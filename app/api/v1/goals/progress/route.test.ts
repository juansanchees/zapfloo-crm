import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildOperationalProgress, operationalGoalsSchema } from "@/lib/metas/config";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { GET, utcMonthWindow } from "./route";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/users/nome-do-atendente", () => ({ nomesDosAtendentes: vi.fn(async () => new Map()) }));
vi.mock("@/lib/webhooks/secrets", () => ({ decryptWebhookSecret: vi.fn() }));

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.mocked(requireRole).mockResolvedValue({ ok: true, user: { id: A, is_platform_admin: false }, org: { orgId: "org-a", role: "agent" } } as never);
  const calls: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  const rows: Record<string, Array<Record<string, unknown>>> = {
    organizations: [{ id: "org-a", settings: { operational_goals: { currency: "BRL", team: { monthly_revenue_cents: 500_000 } } } }],
    user_organizations: [{ organization_id: "org-a", user_id: A, revoked_at: null, accepted_at: "2026-01-01" }, { organization_id: "org-a", user_id: B, revoked_at: null, accepted_at: "2026-01-01" }],
    crm_leads: [{ organization_id: "org-a", owner_user_id: A, value_cents: 80_000, currency: "BRL", status: "won" }, { organization_id: "org-a", owner_user_id: A, value_cents: 99_000, currency: "BRL", status: "lost" }, { organization_id: "org-b", owner_user_id: A, value_cents: 77_000, currency: "BRL", status: "won" }],
    conversations: [{ organization_id: "org-a", assigned_to_user_id: A }, { organization_id: "org-b", assigned_to_user_id: A }],
  };
  class Q implements PromiseLike<unknown> {
    filters: Array<[string, unknown]> = [];
    constructor(readonly table: string) { calls.push({ table, filters: this.filters }); }
    select() { return this; } eq(k: string, v: unknown) { this.filters.push([k, v]); return this; }
    gte(k: string, v: unknown) { this.filters.push([k, v]); return this; } lt(k: string, v: unknown) { this.filters.push([k, v]); return this; }
    is(k: string, v: unknown) { this.filters.push([k, v]); return this; } not() { return this; } order() { return this; } maybeSingle() { return this; }
    then<TResult1 = unknown, TResult2 = never>(onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> { const found = (rows[this.table] ?? []).filter((row) => this.filters.every(([k,v]) => !(k in row) || row[k] === v)); return Promise.resolve({ data: this.table === "organizations" ? (found[0] ?? null) : found, error: null }).then(onfulfilled, onrejected); }
  }
  vi.mocked(createClient).mockResolvedValue({ from: (table: string) => new Q(table) } as never);
  (globalThis as typeof globalThis & { __goalCalls?: typeof calls }).__goalCalls = calls;
});

describe("progresso mensal das metas", () => {
  it("executa GET com tenant, won, janela UTC e recorte self", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json() as { data: { scope: string; members: Array<{ user_id: string; revenue: Array<{ current_cents: number }> }> } };
    expect(body.data.scope).toBe("self");
    expect(body.data.members).toHaveLength(1);
    expect(body.data.members[0]!.user_id).toBe(A);
    expect(body.data.members[0]!.revenue[0]!.current_cents).toBe(80_000);
    const calls = (globalThis as typeof globalThis & { __goalCalls: Array<{ table: string; filters: Array<[string, unknown]> }> }).__goalCalls;
    const leads = calls.find((call) => call.table === "crm_leads")!;
    expect(leads.filters).toEqual(expect.arrayContaining([["organization_id", "org-a"], ["status", "won"], ["owner_user_id", A], ["closed_at", expect.any(String)]]));
    expect(calls.find((call) => call.table === "conversations")!.filters).toEqual(expect.arrayContaining([["organization_id", "org-a"], ["assigned_to_user_id", A]]));
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
