import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const f = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), from: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: f.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: f.from, rpc: f.rpc }) }));
vi.mock("@/lib/audit", () => ({ audit: f.audit }));
import { GET, PATCH } from "@/app/api/v1/channel-sessions/[id]/ai-access/route";
const channel = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ id: channel }) };
let metadata: Record<string, unknown>;
let duringRead: (() => void) | undefined;
let filters: Record<string, unknown>;
beforeEach(() => {
  vi.clearAllMocks(); duringRead = undefined; filters = {};
  metadata = { ai_gate: "allowlist", ai_gate_mode: "pre_go_live", ai_test_phone_numbers: [], transport_marker: "preservar" };
  f.auth.mockResolvedValue({ ok: true, user: { id: "user" }, org: { orgId: "trusted-org" } });
  f.rpc.mockResolvedValue({ data: 1, error: null });
  f.from.mockImplementation(() => {
    let patch: { metadata: Record<string, unknown> } | undefined;
    const ownFilters: Record<string, unknown> = {};
    const q = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), update: vi.fn(), maybeSingle: vi.fn() };
    q.select.mockReturnValue(q); q.is.mockReturnValue(q);
    q.eq.mockImplementation((key: string, value: unknown) => { ownFilters[key] = value; return q; });
    q.update.mockImplementation((value) => { patch = value; return q; });
    q.maybeSingle.mockImplementation(async () => {
      if (!patch) { const data = { metadata: structuredClone(metadata) }; duringRead?.(); return { data, error: null }; }
      filters = ownFilters;
      if (ownFilters.metadata !== JSON.stringify(metadata)) return { data: null, error: null };
      metadata = patch.metadata; return { data: { id: channel }, error: null };
    });
    return q;
  });
});
async function observed() {
  return (await (await GET(new NextRequest("http://localhost/access"), context)).json()).data.access_revision;
}
async function save(revision: string | undefined, restricted = true) {
  return PATCH(new NextRequest("http://localhost/access", { method: "PATCH", body: JSON.stringify({ mode: "pre_go_live", test_phone_numbers: ["+5511999998888"], ...(restricted ? { restricted_only: true, expected_access_revision: revision } : {}) }) }), context);
}
it.each(["open", "list"])("rejeita %s alterado depois do GET sem desfazer a outra aba", async (change) => {
  const revision = await observed();
  if (change === "open") metadata.ai_gate = "open";
  else metadata.ai_test_phone_numbers = ["+5511999997777"];
  const changed = structuredClone(metadata);
  expect((await save(revision)).status).toBe(409);
  expect(metadata).toEqual(changed); expect(f.rpc).not.toHaveBeenCalled(); expect(f.audit).not.toHaveBeenCalled();
});
it("CAS também recusa alteração entre leitura e escrita no servidor", async () => {
  const revision = await observed();
  duringRead = () => { metadata.ai_gate = "open"; };
  expect((await save(revision)).status).toBe(409);
  expect(metadata.ai_gate).toBe("open");
  expect(filters.organization_id).toBe("trusted-org"); expect(filters.id).toBe(channel);
  expect(filters.metadata).toContain('"ai_gate":"allowlist"');
});
it("salvamento corrente preserva metadata alheia e mantém resposta canônica", async () => {
  const revision = await observed(); metadata.transport_marker = "outra alteração";
  const response = await save(revision);
  expect(response.status).toBe(200);
  expect(metadata).toEqual({ ai_gate: "allowlist", ai_gate_mode: "pre_go_live", ai_test_phone_numbers: ["+5511999998888"], transport_marker: "outra alteração" });
  expect((await response.json()).data.access_revision).toMatch(/^[a-f0-9]{64}$/);
});
it("consumidor geral continua usando a RPC explícita sem precondição", async () => {
  expect((await save(undefined, false)).status).toBe(200);
  expect(f.rpc).toHaveBeenCalledWith("fn_configurar_pre_go_live_canal", { p_org: "trusted-org", p_canal: channel, p_modo: "pre_go_live", p_numeros: ["+5511999998888"] });
});
it("wizard sem revisão observada falha fechado", async () => {
  expect((await save(undefined)).status).toBe(422); expect(f.rpc).not.toHaveBeenCalled();
});
