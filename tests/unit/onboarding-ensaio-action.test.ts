import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Shared from "@/app/actions/onboarding/_shared";
const f = vi.hoisted(() => ({ ctx: vi.fn(), rpc: vi.fn(), execute: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: f.limit }));
vi.mock("@/app/actions/onboarding/_shared", async original => ({ ...await original<typeof Shared>(), requireOnboardingCtx: f.ctx }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: f.rpc }) }));
vi.mock("@/lib/onboarding/executar-ensaio", () => ({ executarEnsaio: f.execute }));
import { iniciarEnsaio, revisarEnsaio } from "@/app/actions/onboarding/ensaio";
const org = "11111111-1111-4111-8111-111111111111"; const user = "22222222-2222-4222-8222-222222222222";
const vid = "33333333-3333-4333-8333-333333333333"; const run = "44444444-4444-4444-8444-444444444444";
const context = createHash("sha256").update(JSON.stringify(["onboarding-draft", user, org])).digest("hex");
const input = { expected_context: context, expected_revision: 1, expected_version_id: vid, sample_message: "Olá" };
const snapshot = { id: vid, agent_id: user, organization_id: org, system_prompt: "Prompt capturado pelo banco", model: "modelo", provider: "openai", credential_id: null, status: "draft", channel_session_id: null };
const proof = { run_id: run, revision: 1, version_id: vid, sample_message: "Olá", response: "Resposta", status: "completed", reviewed: false, call_id: user, error: null };
beforeEach(() => {
  vi.clearAllMocks(); f.limit.mockResolvedValue({ allowed: true }); f.ctx.mockResolvedValue({ orgId: org, userId: user });
  f.rpc.mockImplementation(async (name: string) => ({ data: name === "fn_iniciar_ensaio_onboarding" ? { run_id: run, snapshot } : proof, error: null }));
  f.execute.mockResolvedValue({ ok: true, response: "Resposta", call_id: user });
});
describe("ensaio: o browser nunca fornece prompt/prova/identidade", () => {
  it("limite técnico recusa nova chamada antes de gravar ou cobrar IA", async () => {
    f.limit.mockResolvedValue({ allowed: false });
    expect(await iniciarEnsaio(input)).toEqual({ ok: false, error: "rehearsal_rate_limited" });
    expect(f.execute).not.toHaveBeenCalled(); expect(f.rpc).not.toHaveBeenCalled();
  });
  it("envia snapshot capturado à IA e finaliza pelo mesmo run sem releitura", async () => {
    expect(await iniciarEnsaio(input)).toEqual({ ok: true, proof });
    expect(f.execute).toHaveBeenCalledWith(snapshot, "Olá");
    expect(Object.isFrozen(f.execute.mock.calls[0]![0])).toBe(true);
    expect(f.rpc).toHaveBeenLastCalledWith("fn_finalizar_ensaio_onboarding", expect.objectContaining({ p_org_id: org, p_actor_id: user, p_run_id: run, p_call_id: user, p_response: "Resposta" }));
  });
  it.each([{ prompt: "forjado" }, { organization_id: user }, { provider: "openai" }, { sample_message: " " }])("recusa input forjado %j antes da IA", async patch => {
    expect(await iniciarEnsaio({ ...input, ...patch })).toEqual({ ok: false, error: "invalid_input" });
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("outra organização e snapshot externo não chamam IA", async () => {
    f.ctx.mockResolvedValue({ orgId: user, userId: user });
    expect(await iniciarEnsaio(input)).toEqual({ ok: false, error: "draft_context_changed" });
    f.ctx.mockResolvedValue({ orgId: org, userId: user });
    f.rpc.mockResolvedValue({ data: { run_id: run, snapshot: { ...snapshot, organization_id: user } }, error: null });
    expect(await iniciarEnsaio(input)).toEqual({ ok: false, error: "db_error" });
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("conflito pós-rede e erro com segredo nunca viram prova", async () => {
    f.rpc.mockResolvedValueOnce({ data: { run_id: run, snapshot }, error: null }).mockResolvedValueOnce({ data: null, error: { message: "draft_conflict" } });
    expect(await iniciarEnsaio(input)).toEqual({ ok: false, error: "draft_conflict" });
    f.rpc.mockResolvedValue({ data: null, error: { message: "sk-chave-nao-expor" } });
    expect(await revisarEnsaio({ expected_context: context, expected_revision: 1, expected_version_id: vid, run_id: run })).toEqual({ ok: false, error: "db_error" });
  });
});
