import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ ranges: [] as Array<[number, number]> }));
const leads = Array.from({ length: 1_001 }, (_, index) => ({
  id: `lead-${index + 1}`, organization_id: "org-a", pipeline_id: "p1", stage_id: "s1",
  title: `Lead ${index + 1}`, status: "open", value_cents: 100, currency: "BRL",
  contact_id: null, owner_kind: null, owner_agent_id: null, closed_at: null,
  position_in_stage: index + 1,
}));

vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: vi.fn(async () => ({ id: "u", idioma: "pt-BR", organizations: [] })),
  resolveActiveOrg: vi.fn(async () => ({ orgId: "org-a", name: "A", role: "agent" })),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({
  auth: { getUser: async () => ({ data: { user: { id: "u" } }, error: null }) },
  from: (table: string) => {
    let selection = "";
    let range: [number, number] | null = null;
    const query: Record<string, unknown> = {};
    for (const method of ["eq", "neq", "in", "not", "order", "maybeSingle"]) query[method] = () => query;
    query.select = (value: string) => { selection = value; return query; };
    query.range = (from: number, to: number) => { range = [from, to]; state.ranges.push(range); return query; };
    query.then = (resolve: (value: { data: unknown; error: null }) => unknown) => {
      if (table === "crm_leads") return Promise.resolve({ data: leads.slice(range?.[0] ?? 0, (range?.[1] ?? -1) + 1), error: null }).then(resolve);
      if (table === "crm_pipelines") return Promise.resolve({ data: selection === "id" ? { id: "p1" } : { id: "p1", organization_id: "org-a", name: "Funil", settings: {} }, error: null }).then(resolve);
      return Promise.resolve({ data: [], error: null }).then(resolve);
    };
    return query;
  },
})) }));

describe("pagina o snapshot completo do board", () => {
  beforeEach(() => { state.ranges = []; });

  it("busca a segunda página acima de max_rows e a inclui uma única vez em cards e soma", async () => {
    const { GET } = await import("./route");
    const response = await GET(new NextRequest("http://local/api/v1/pipelines/p1/board"), { params: Promise.resolve({ id: "p1" }) });
    const body = await response.json() as { data: { leads: Array<{ id: string }>; summary: { open_by_currency: Record<string, number> } } };

    expect(response.status).toBe(200);
    expect(state.ranges).toEqual([[0, 999], [1000, 1999]]);
    expect(body.data.leads).toHaveLength(1_001);
    expect(new Set(body.data.leads.map((lead) => lead.id)).size).toBe(1_001);
    expect(body.data.summary.open_by_currency.BRL).toBe(100_100);
  });
});
