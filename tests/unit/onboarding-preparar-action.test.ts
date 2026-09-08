import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const fake = vi.hoisted(() => ({ ctx: vi.fn(), rpc: vi.fn(), readDraft: vi.fn(), readOrg: vi.fn(), eqDraft: vi.fn(), eqOrg: vi.fn(), admin: vi.fn() }));
vi.mock("@/app/actions/onboarding/_shared", async original => ({ ...await original<typeof import("@/app/actions/onboarding/_shared")>(), requireOnboardingCtx: fake.ctx }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: fake.admin }));
import { OnboardingError } from "@/app/actions/onboarding/_shared";
import { prepararRascunho } from "@/app/actions/onboarding/prepararRascunho";

const context = createHash("sha256").update(JSON.stringify(["onboarding-draft", "ator-confiavel", "org-confiavel"])).digest("hex");
const input = { expected_context: context, expected_revision: 1, expected_version_id: null, provider: "openai", model: "modelo-escolhido", credential_id: null };
const configuration = { name: "Lia QA", prompt_template: "support_minimal", regras_da_casa: "Não prometa descontos." };
const prepared = { revision: 1, agent_id: "00000000-0000-4000-8000-000000000001", version_id: "00000000-0000-4000-8000-000000000002" };
beforeEach(() => {
  vi.clearAllMocks();
  fake.ctx.mockResolvedValue({ userId: "ator-confiavel", orgId: "org-confiavel" });
  fake.readDraft.mockResolvedValue({ data: { revision: 1, configuration }, error: null });
  fake.readOrg.mockResolvedValue({ data: { display_name: "Negócio QA", legal_name: "QA", onboarding_state: {} }, error: null });
  fake.eqDraft.mockReturnValue({ maybeSingle: fake.readDraft }); fake.eqOrg.mockReturnValue({ maybeSingle: fake.readOrg });
  fake.rpc.mockResolvedValue({ data: prepared, error: null });
  fake.admin.mockReturnValue({ rpc: fake.rpc, from: (table: string) => ({ select: () => ({ eq: table === "onboarding_drafts" ? fake.eqDraft : fake.eqOrg }) }) });
});
describe("preparar rascunho: entrada sem publicação ou escolha implícita", () => {
  it("usa identidade e conteúdo do servidor, mantendo seleção explícita", async () => {
    expect(await prepararRascunho(input)).toEqual({ ok: true, ...prepared });
    expect(fake.eqDraft).toHaveBeenCalledWith("organization_id", "org-confiavel");
    expect(fake.eqOrg).toHaveBeenCalledWith("id", "org-confiavel");
    expect(fake.rpc).toHaveBeenCalledWith("fn_prepare_onboarding_draft", {
      p_org_id: "org-confiavel", p_actor_id: "ator-confiavel", p_expected_revision: 1, p_expected_version_id: null,
      p_expected_business: { display_name: "Negócio QA", o_que_faz: null },
      p_version: { system_prompt: "Você atende os clientes de Negócio QA. Responda em frases curtas, peça apenas o que for necessário e chame uma pessoa do time assim que a dúvida sair do seu alcance.\n\nRegras deste rascunho:\nNão prometa descontos.", provider: "openai", model: "modelo-escolhido", credential_id: null, tool_ids: expect.any(Array) },
    });
    expect(fake.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["forbidden", "mfa_required"] as const)("%s impede acesso ao banco", async code => {
    fake.ctx.mockRejectedValue(new OnboardingError(code, "Negado"));
    expect(await prepararRascunho(input)).toEqual({ ok: false, error: code });
    expect(fake.admin).not.toHaveBeenCalled();
  });
  it("troca de organização não grava no novo contexto", async () => {
    fake.ctx.mockResolvedValue({ userId: "ator-confiavel", orgId: "outra-org" });
    expect(await prepararRascunho(input)).toEqual({ ok: false, error: "draft_context_changed" });
    expect(fake.admin).not.toHaveBeenCalled();
  });
  it.each([{ model: "" }, { provider: "inventado" }, { organization_id: "outra" }, { system_prompt: "forjado" }])("não aceita seleção ausente nem conteúdo/identidade forjados: %j", async patch => {
    expect(await prepararRascunho({ ...input, ...patch })).toEqual({ ok: false, error: "invalid_input" });
    expect(fake.admin).not.toHaveBeenCalled();
  });
  it("não prepara uma revisão diferente da que a aba viu", async () => {
    fake.readDraft.mockResolvedValue({ data: { revision: 2, configuration }, error: null });
    expect(await prepararRascunho(input)).toEqual({ ok: false, error: "draft_conflict" });
    expect(fake.rpc).not.toHaveBeenCalled();
  });
  it("falha de leitura e resposta incompleta não viram sucesso", async () => {
    fake.readOrg.mockResolvedValue({ data: null, error: { message: "segredo" } });
    expect(await prepararRascunho(input)).toEqual({ ok: false, error: "db_error" });
    expect(fake.rpc).not.toHaveBeenCalled();
    fake.readOrg.mockResolvedValue({ data: { display_name: "QA", legal_name: "QA", onboarding_state: {} }, error: null });
    fake.rpc.mockResolvedValue({ data: {}, error: null });
    expect(await prepararRascunho(input)).toEqual({ ok: false, error: "db_error" });
  });
  it("erro esperado é legível e detalhe inesperado fica no servidor", async () => {
    fake.rpc.mockResolvedValue({ data: null, error: { message: "draft_model_unavailable" } });
    expect(await prepararRascunho(input)).toEqual({ ok: false, error: "draft_model_unavailable" });
    fake.rpc.mockResolvedValue({ data: null, error: { message: "segredo" } });
    expect(await prepararRascunho(input)).toEqual({ ok: false, error: "db_error" });
  });
});
