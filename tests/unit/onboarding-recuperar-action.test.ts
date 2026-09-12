import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Shared from "@/app/actions/onboarding/_shared";
const f = vi.hoisted(() => ({ ctx: vi.fn(), rpc: vi.fn() }));
vi.mock("@/app/actions/onboarding/_shared", async original => ({ ...await original<typeof Shared>(), requireOnboardingCtx: f.ctx }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: f.rpc }) }));
import { recuperarPreparacao } from "@/app/actions/onboarding/recuperarPreparacao";
import { OnboardingError } from "@/app/actions/onboarding/_shared";
const org = "11111111-1111-4111-8111-111111111111";
const user = "22222222-2222-4222-8222-222222222222";
const version = "33333333-3333-4333-8333-333333333333";
const context = createHash("sha256").update(JSON.stringify(["onboarding-draft", user, org])).digest("hex");
const input = { expected_context: context, expected_revision: 1, expected_version_id: version };
beforeEach(() => { vi.clearAllMocks(); f.ctx.mockResolvedValue({ orgId: org, userId: user }); f.rpc.mockResolvedValue({ data: { revision: 1 }, error: null }); });
describe("recuperação usa identidade confiável e falha explícita", () => {
  it("projeta argumentos da sessão e CAS e aceita ponteiro removido", async () => {
    expect(await recuperarPreparacao({ ...input, expected_version_id: null })).toEqual({ ok: true, revision: 1 });
    expect(f.rpc).toHaveBeenCalledWith("fn_recuperar_preparacao_onboarding", { p_org_id: org, p_actor_id: user, p_expected_revision: 1, p_expected_version_id: null });
  });
  it.each(["forbidden", "mfa_required"] as const)("%s recusa antes da RPC", async code => {
    f.ctx.mockRejectedValue(new OnboardingError(code, "QA"));
    expect(await recuperarPreparacao(input)).toEqual({ ok: false, error: code });
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("outra aba/tenant e IDs injetados não chegam à RPC", async () => {
    expect(await recuperarPreparacao({ ...input, organization_id: org })).toEqual({ ok: false, error: "invalid_input" });
    f.ctx.mockResolvedValue({ orgId: user, userId: user });
    expect(await recuperarPreparacao(input)).toEqual({ ok: false, error: "draft_context_changed" });
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("conflito é visível e erro arbitrário nunca vaza conteúdo", async () => {
    f.rpc.mockResolvedValueOnce({ data: null, error: { message: "draft_conflict" } });
    expect(await recuperarPreparacao(input)).toEqual({ ok: false, error: "draft_conflict" });
    f.rpc.mockResolvedValueOnce({ data: null, error: { message: "conteudo-privado-sintetico" } });
    expect(await recuperarPreparacao(input)).toEqual({ ok: false, error: "db_error" });
  });
});
