import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({ ctx: vi.fn(), rpc: vi.fn(), read: vi.fn(), eq: vi.fn(), admin: vi.fn() }));
vi.mock("@/app/actions/onboarding/_shared", async importOriginal => ({
  ...await importOriginal<typeof import("@/app/actions/onboarding/_shared")>(), requireOnboardingCtx: fake.ctx,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: fake.admin }));
import { OnboardingError } from "@/app/actions/onboarding/_shared";
import { salvarRascunho, lerRascunho } from "@/app/actions/onboarding/rascunho";
import { createHash } from "node:crypto";

const context = createHash("sha256").update(JSON.stringify(["onboarding-draft", "ator-confiavel", "org-confiavel"])).digest("hex");

const configuration = { name: "Sofia QA", prompt_template: "support_minimal", regras_da_casa: "Não prometer descontos." };
beforeEach(() => {
  vi.clearAllMocks();
  fake.ctx.mockResolvedValue({ userId: "ator-confiavel", orgId: "org-confiavel" });
  fake.rpc.mockResolvedValue({ data: { revision: 1, configuration }, error: null });
  fake.read.mockResolvedValue({ data: null, error: null });
  fake.eq.mockReturnValue({ maybeSingle: fake.read });
  fake.admin.mockReturnValue({ rpc: fake.rpc, from: () => ({ select: () => ({ eq: fake.eq }) }) });
});
describe("rascunho: action não confia em IDs ou sucesso do browser", () => {
  it("recusa formulário de outra organização mesmo com a mesma revisão", async () => {
    fake.ctx.mockResolvedValue({ userId: "ator-confiavel", orgId: "org-trocada-em-outra-aba" });
    expect(await salvarRascunho({ expected_context: context, expected_revision: 0, configuration })).toEqual({ ok: false, error: "draft_context_changed" });
    expect(fake.admin).not.toHaveBeenCalled();
  });
  it("recusa formulário de outro usuário e contexto ausente antes de gravar", async () => {
    fake.ctx.mockResolvedValue({ userId: "outro-ator", orgId: "org-confiavel" });
    expect(await salvarRascunho({ expected_context: context, expected_revision: 0, configuration })).toEqual({ ok: false, error: "draft_context_changed" });
    expect(await salvarRascunho({ expected_revision: 0, configuration })).toEqual({ ok: false, error: "invalid_input" });
    expect(fake.admin).not.toHaveBeenCalled();
  });
  it.each(["forbidden", "mfa_required"] as const)("%s interrompe antes do banco", async code => {
    fake.ctx.mockRejectedValue(new OnboardingError(code, "Sem acesso"));
    expect(await salvarRascunho({ expected_context: context, expected_revision: 0, configuration })).toEqual({ ok: false, error: code });
    expect(fake.admin).not.toHaveBeenCalled();
  });
  it("salva com identidade da sessão e não aceita organization_id no payload", async () => {
    expect(await salvarRascunho({ expected_context: context, expected_revision: 0, configuration })).toEqual({ ok: true, revision: 1 });
    expect(fake.rpc).toHaveBeenCalledWith("fn_save_onboarding_draft", { p_org_id: "org-confiavel", p_actor_id: "ator-confiavel", p_expected_revision: 0, p_configuration: configuration });
    fake.rpc.mockClear();
    expect(await salvarRascunho({ expected_context: context, expected_revision: 0, configuration, organization_id: "outra-org" })).toEqual({ ok: false, error: "invalid_input" });
    expect(fake.rpc).not.toHaveBeenCalled();
  });
  it("nome curto é recusado sem gravar", async () => {
    expect(await salvarRascunho({ expected_context: context, expected_revision: 0, configuration: { ...configuration, name: "x" } })).toEqual({ ok: false, error: "invalid_input" });
    expect(fake.rpc).not.toHaveBeenCalled();
  });
  it("conflito é explícito e não é sucesso", async () => {
    fake.rpc.mockResolvedValue({ data: null, error: { message: "draft_conflict" } });
    expect(await salvarRascunho({ expected_context: context, expected_revision: 0, configuration })).toEqual({ ok: false, error: "draft_conflict" });
  });
  it("erro inesperado não vaza detalhe do banco", async () => {
    fake.rpc.mockResolvedValue({ data: null, error: { message: "segredo-sintetico-do-banco" } });
    expect(await salvarRascunho({ expected_context: context, expected_revision: 0, configuration })).toEqual({ ok: false, error: "db_error" });
  });
  it("resposta incompleta não vira sucesso", async () => {
    fake.rpc.mockResolvedValue({ data: {}, error: null });
    expect(await salvarRascunho({ expected_context: context, expected_revision: 0, configuration })).toEqual({ ok: false, error: "db_error" });
  });
  it("retoma apenas a organização autorizada", async () => {
    fake.read.mockResolvedValue({ data: { revision: 2, configuration }, error: null });
    expect(await lerRascunho()).toEqual({ ok: true, context, draft: { revision: 2, configuration } });
    expect(fake.eq).toHaveBeenCalledWith("organization_id", "org-confiavel");
  });
  it("falha de leitura não se confunde com rascunho vazio", async () => {
    fake.read.mockResolvedValue({ data: null, error: { message: "falha-sintetica" } });
    expect(await lerRascunho()).toEqual({ ok: false, error: "db_error" });
  });
});
