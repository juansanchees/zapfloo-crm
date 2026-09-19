import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ filters: [] as Array<[string, unknown]>, from: [] as string[] }));
vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: vi.fn(async () => ({ id: "u", idioma: "pt-BR", organizations: [] })),
  resolveActiveOrg: vi.fn(async () => ({ orgId: "org-a", name: "A", role: "agent" })),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({
  auth: { getUser: async () => ({ data: { user: { id: "u" } }, error: null }) },
  from: (table: string) => {
    state.from.push(table);
    const result = { data: null, error: null };
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "maybeSingle", "eq", "neq", "in", "not", "order"]) {
      chain[method] = (...args: unknown[]) => { if (method === "eq") state.filters.push([String(args[0]), args[1]]); return chain; };
    }
    chain.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
    return chain;
  },
})) }));

describe("GET board no tenant ativo", () => {
  beforeEach(() => { state.filters = []; state.from = []; });

  it("recusa pipeline de outra organização antes de ler etapas, leads ou contatos", async () => {
    const { GET } = await import("./route");
    const response = await GET(new NextRequest("http://local/api/v1/pipelines/pipeline-b/board"), { params: Promise.resolve({ id: "pipeline-b" }) });
    expect(response.status).toBe(404);
    expect(state.filters).toContainEqual(["organization_id", "org-a"]);
    expect(state.from).toEqual(["crm_pipelines"]);
  });
});
