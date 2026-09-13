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
import type { PainelEnsaio } from "@/lib/onboarding/ensaio";
const version = "11111111-1111-4111-8111-111111111111";
const proof = { run_id: version, version_id: version, revision: 1, sample_message: "Olá", response: "Resposta da IA", status: "completed" as const, call_id: version, reviewed: false, error: null };
const selection = { version_id: version, agent_id: version, revision: 1, provider: "openai" as const, model: "gpt-5.6-luna", credential_id: null };
const models: PainelEnsaio["models"] = [
  { provider: "anthropic", model_id: "outro", display_name: "Primeiro disponível" },
  { provider: "openai", model_id: "gpt-5.6-luna", display_name: "GPT-5.6 Luna" },
];
const draft = { ok: true as const, context: "a".repeat(64), draft: { revision: 1, configuration: { name: "Atendente QA", prompt_template: "support_minimal" as const, regras_da_casa: "" } } };
function setup(prepared = false, catalog = models) { return render(<SetupAiForm capacidades={[]} conferencias={[]} rascunhoInicial={draft} ensaioInicial={{ ok: true, panel: { selection: prepared ? selection : null, proof: prepared ? proof : null, models: catalog, credentials: [] } }} />); }
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
  it("usa o padrão sem decisões técnicas e só continua após testar e revisar", async () => {
    setup();
    expect(screen.queryByLabelText("Modelo do ensaio")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Credencial do ensaio")).not.toBeInTheDocument();
    expect(screen.queryByText(/créditos de API/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Testar mensagem" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Preparar ensaio" }));
    await waitFor(() => expect(f.prepare).toHaveBeenCalledWith(expect.objectContaining({ provider: "openai", model: "gpt-5.6-luna", credential_id: null })));
    fireEvent.change(screen.getByLabelText("Mensagem de exemplo"), { target: { value: "Olá" } });
    fireEvent.click(screen.getByRole("button", { name: "Testar mensagem" }));
    expect(await screen.findByText("Resposta da IA")).toBeInTheDocument();
    expect(f.review).not.toHaveBeenCalled();
    const continuar = screen.getByRole("button", { name: "Continuar para conexão" });
    expect(continuar).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Revisar resposta" }));
    expect(await screen.findByText("Resposta revisada. Nenhum atendimento foi ativado.")).toBeInTheDocument();
    expect(continuar).toBeEnabled();
    f.confirm.mockResolvedValueOnce({ ok: true });
    fireEvent.click(continuar);
    await waitFor(() => expect(f.push).toHaveBeenCalledWith("/onboarding/connect-whatsapp"));
    expect(f.legacy).not.toHaveBeenCalled();
  });
  it("sem o padrão no catálogo usa o primeiro disponível e mantém a sequência", async () => {
    const catalog = models.filter(m => m.model_id !== "gpt-5.6-luna");
    const fallback = { ...selection, provider: catalog[0]!.provider, model: catalog[0]!.model_id };
    f.prepare.mockResolvedValue({ ok: true, ...fallback });
    f.read.mockResolvedValue({ ok: true, panel: { selection: fallback, proof: null, models: catalog, credentials: [] } });
    setup(false, catalog);
    expect(screen.getByRole("button", { name: "Preparar ensaio" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Preparar ensaio" }));
    await waitFor(() => expect(f.prepare).toHaveBeenCalledWith(expect.objectContaining({ provider: "anthropic", model: "outro", credential_id: null })));
    fireEvent.change(screen.getByLabelText("Mensagem de exemplo"), { target: { value: "Olá" } });
    fireEvent.click(screen.getByRole("button", { name: "Testar mensagem" }));
    expect(await screen.findByText("Resposta da IA")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Revisar resposta" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Continuar para conexão" })).toBeEnabled());
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
  it("modelo preparado que saiu do catálogo exige nova preparação e mantém a mensagem", () => {
    setup(true, models.filter(m => m.model_id !== "gpt-5.6-luna"));
    expect(screen.getByRole("button", { name: "Revisar resposta" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Preparar ensaio" })).toBeEnabled();
    expect(screen.getByLabelText("Mensagem de exemplo")).toHaveValue("Olá");
  });
  it("catálogo vazio não lança nem inventa modelo e permite continuar depois", () => {
    setup(false, []);
    expect(screen.getByRole("button", { name: "Preparar ensaio" })).toBeDisabled();
    expect(screen.getByText("O ensaio está indisponível no momento. Você pode continuar depois; se persistir, entre em contato com o suporte.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Explorar o CRM" })).toBeEnabled();
    expect(f.prepare).not.toHaveBeenCalled();
  });
});
