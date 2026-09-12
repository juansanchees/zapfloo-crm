import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ prepare: vi.fn(), start: vi.fn(), review: vi.fn(), read: vi.fn(), save: vi.fn(), legacy: vi.fn(), confirm: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: f.push, refresh: f.refresh }) }));
vi.mock("@/app/actions/onboarding/concluir", () => ({ confirmarAgenteRevisado: f.confirm }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/app/actions/onboarding/prepararRascunho", () => ({ prepararRascunho: f.prepare }));
vi.mock("@/app/actions/onboarding/ensaio", () => ({ iniciarEnsaio: f.start, revisarEnsaio: f.review, lerEnsaio: f.read }));
vi.mock("@/app/actions/onboarding/rascunho", () => ({ salvarRascunho: f.save }));
vi.mock("@/app/actions/onboarding/createDefaultAgent", () => ({ createDefaultAgent: f.legacy, skipAi: vi.fn() }));
import { SetupAiForm } from "@/app/onboarding/setup-ai/_form";
const version = "11111111-1111-4111-8111-111111111111";
const proof = { run_id: version, version_id: version, revision: 1, sample_message: "Olá", response: "Resposta da IA", status: "completed" as const, call_id: version, reviewed: false, error: null };
const selection = { version_id: version, agent_id: version, revision: 1, provider: "openai" as const, model: "qa", credential_id: null };
const models = [{ provider: "openai" as const, model_id: "qa", display_name: "QA" }];
const draft = { ok: true as const, context: "a".repeat(64), draft: { revision: 1, configuration: { name: "Atendente QA", prompt_template: "support_minimal" as const, regras_da_casa: "" } } };
function setup(prepared = false) { return render(<SetupAiForm capacidades={[]} conferencias={[]} rascunhoInicial={draft} ensaioInicial={{ ok: true, panel: { selection: prepared ? selection : null, proof: prepared ? proof : null, models, credentials: [] } }} />); }
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); f.prepare.mockResolvedValue({ ok: true, ...selection }); f.read.mockResolvedValue({ ok: true, panel: { selection, proof: null, models, credentials: [] } }); f.start.mockResolvedValue({ ok: true, proof }); f.review.mockResolvedValue({ ok: true, proof: { ...proof, reviewed: true } }); });
describe("ensaio integrado na tela", () => {
  it("continuação separada exige revisão corrente e sucesso confirmado sem criar agente legado", async () => {
    setup(true);
    const continuar = screen.getByRole("button", { name: "Continuar para conexão" });
    expect(continuar).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Revisar resposta" }));
    await waitFor(() => expect(continuar).toBeEnabled());
    f.confirm.mockResolvedValueOnce({ ok: false, error: "draft_conflict" });
    fireEvent.click(continuar);
    expect(await screen.findByRole("alert")).toHaveTextContent("A configuração ou organização mudou");
    expect(f.push).not.toHaveBeenCalled();
    expect(continuar).toBeDisabled();
    expect(f.legacy).not.toHaveBeenCalled();
  });
  it("objetivo editado invalida revisão e resumo acompanha o formulário", async () => {
    setup(true);
    fireEvent.click(screen.getByRole("button", { name: "Revisar resposta" }));
    await screen.findByText("Resposta revisada. Nenhum atendimento foi ativado.");
    fireEvent.change(screen.getByLabelText("Objetivo do agente"), { target: { value: "Qualificar orçamentos" } });
    expect(screen.getByRole("button", { name: "Continuar para conexão" })).toBeDisabled();
    expect(screen.getByRole("complementary", { name: "Resumo do agente" })).toHaveTextContent("Qualificar orçamentos");
  });
  it("sem escolha automática, prepara explicitamente e exige revisão separada", async () => {
    setup(); expect(screen.getByLabelText("Modelo do ensaio")).toHaveValue("");
    expect(screen.getByLabelText("Credencial do ensaio")).toHaveAccessibleDescription("Credencial disponível deste provedor (organização/instalação)");
    expect(screen.getByRole("button", { name: "Testar mensagem" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Modelo do ensaio"), { target: { value: "openai/qa" } });
    fireEvent.click(screen.getByRole("button", { name: "Preparar ensaio" }));
    await waitFor(() => expect(f.prepare).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("Mensagem de exemplo"), { target: { value: "Olá" } });
    fireEvent.click(screen.getByRole("button", { name: "Testar mensagem" }));
    expect(await screen.findByText("Resposta da IA")).toBeInTheDocument();
    expect(f.review).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Revisar resposta" }));
    expect(await screen.findByText("Resposta revisada. Nenhum atendimento foi ativado.")).toBeInTheDocument();
    expect(f.legacy).not.toHaveBeenCalled();
  });
  it("campo editado retira resultado revisável; Enter não pode submeter fluxo legado", () => {
    setup(true); expect(screen.getByRole("button", { name: "Revisar resposta" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Como ele vai se chamar"), { target: { value: "Mudou" } });
    expect(screen.getByRole("button", { name: "Revisar resposta" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Testar mensagem" })).toBeDisabled();
    expect(screen.getByLabelText("Mensagem de exemplo").closest("form")).toBeNull();
    fireEvent.keyDown(screen.getByLabelText("Mensagem de exemplo"), { key: "Enter", code: "Enter" });
    expect(f.legacy).not.toHaveBeenCalled();
  });
  it("trocar modelo invalida revisão e erro mantém a mensagem", async () => {
    setup(true);
    fireEvent.change(screen.getByLabelText("Modelo do ensaio"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Revisar resposta" })).toBeDisabled();
    expect(screen.getByLabelText("Mensagem de exemplo")).toHaveValue("Olá");
  });
});
