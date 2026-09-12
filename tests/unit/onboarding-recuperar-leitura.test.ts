import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Shared from "@/app/actions/onboarding/_shared";
const f = vi.hoisted(() => ({ ctx: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/app/actions/onboarding/_shared", async original => ({ ...await original<typeof Shared>(), requireOnboardingCtx: f.ctx }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: f.rpc, from: f.from }) }));
vi.mock("@/lib/onboarding/executar-ensaio", () => ({ executarEnsaio: vi.fn() }));
import { lerEnsaio } from "@/app/actions/onboarding/ensaio";
const org = "11111111-1111-4111-8111-111111111111";
const user = "22222222-2222-4222-8222-222222222222";
const version = "33333333-3333-4333-8333-333333333333";
const context = createHash("sha256").update(JSON.stringify(["onboarding-draft", user, org])).digest("hex");
const draft = { revision: 1, prepared_revision: 1, prepared_agent_id: user, prepared_version_id: version, prepared_snapshot: { provider: "openai", model: "qa", credential_id: null }, rehearsal: null };
function dadosDoBanco(value: typeof draft | null) {
  f.from.mockImplementation((table: string) => {
    const result = { data: table === "onboarding_drafts" ? value : table === "ai_agents" ? { is_active: false, is_default: false, published_version_id: null, archived_at: "2026-09-10T12:00:00Z" } : [], error: null };
    const query: Record<string, unknown> = { then: (resolve: (r: typeof result) => unknown) => Promise.resolve(result).then(resolve) };
    for (const method of ["select", "eq", "is", "not", "order", "maybeSingle"]) query[method] = vi.fn(() => query);
    return query;
  });
}
beforeEach(() => { vi.clearAllMocks(); f.ctx.mockResolvedValue({ orgId: org, userId: user }); f.rpc.mockResolvedValue({ data: null, error: { message: "draft_unavailable" } }); dadosDoBanco(draft); });
describe("leitura expõe recuperação sem inventar prova de ensaio", () => {
  it("editar o rascunho antes de arquivar não esconde a recuperação", async () => {
    dadosDoBanco({ ...draft, revision: 2 });
    f.rpc.mockResolvedValue({ data: null, error: { message: "draft_conflict" } });
    const result = await lerEnsaio({ expected_context: context });
    expect(result.ok && result.panel.recovery_available).toBe(true);
    expect(result.ok && result.panel.proof).toBeNull();
  });
  it("preparação indisponível deixa painel acessível e sem prova", async () => {
    expect(await lerEnsaio({ expected_context: context })).toEqual({ ok: true, panel: { selection: { revision: 1, agent_id: user, version_id: version, provider: "openai", model: "qa", credential_id: null }, proof: null, models: [], credentials: [], recovery_available: true } });
    expect(f.rpc).toHaveBeenCalledWith("fn_validar_ensaio_onboarding", { p_org_id: org, p_actor_id: user, p_expected_revision: 1, p_expected_version_id: version });
  });
  it("FK apagada conserva revisão preparada como sinal de recuperação", async () => {
    dadosDoBanco({ ...draft, prepared_agent_id: null, prepared_version_id: null } as unknown as typeof draft);
    expect(await lerEnsaio({ expected_context: context })).toEqual({ ok: true, panel: { selection: null, proof: null, models: [], credentials: [], recovery_available: true } });
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("rascunho novo não oferece recuperação nem prova", async () => {
    dadosDoBanco(null);
    expect(await lerEnsaio({ expected_context: context })).toEqual({ ok: true, panel: { selection: null, proof: null, models: [], credentials: [], recovery_available: false } });
  });
});
