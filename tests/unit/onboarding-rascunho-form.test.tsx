import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ salvar: vi.fn(), criar: vi.fn() }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/app/actions/onboarding/rascunho", () => ({ salvarRascunho: mocks.salvar }));
vi.mock("@/app/actions/onboarding/createDefaultAgent", () => ({ createDefaultAgent: mocks.criar, skipAi: vi.fn() }));
import { SetupAiForm } from "@/app/onboarding/setup-ai/_form";

const context = "a".repeat(64);
const configuration = { name: "Atendente QA", prompt_template: "support_minimal" as const, regras_da_casa: "Não oferecer descontos.", objetivo: "" };
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.salvar.mockResolvedValue({ ok: true, revision: 4 }); });

describe("rascunho preparatório na tela", () => {
  it("mantém contexto e campos juntos quando recebe props de outra organização", async () => {
    const { rerender } = render(<SetupAiForm capacidades={[]} conferencias={[]} rascunhoInicial={{ ok: true, context, draft: { revision: 3, configuration } }} />);
    rerender(<SetupAiForm capacidades={[]} conferencias={[]} rascunhoInicial={{ ok: true, context: "b".repeat(64), draft: null }} />);
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    await waitFor(() => expect(mocks.salvar).toHaveBeenCalledWith({ expected_context: context, expected_revision: 3, configuration }));
  });

  it("bloqueia edição e criação enquanto salva e não anuncia alterações posteriores como salvas", async () => {
    let finish!: (value: { ok: true; revision: number }) => void;
    mocks.salvar.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<SetupAiForm capacidades={[]} conferencias={[]} rascunhoInicial={{ ok: true, context, draft: null }} />);
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    await waitFor(() => expect(screen.getByLabelText("Como ele vai se chamar")).toBeDisabled());
    expect(screen.queryByRole("button", { name: "Criar e continuar" })).toBeNull();
    await act(async () => finish({ ok: true, revision: 1 }));
    expect(screen.getByLabelText("Como ele vai se chamar")).toBeEnabled();
  });

  it("retoma campos e salva a revisão sem criar ou publicar agente", async () => {
    render(<SetupAiForm capacidades={[]} conferencias={[]} rascunhoInicial={{ ok: true, context, draft: { revision: 3, configuration } }} />);
    expect(screen.getByLabelText("Como ele vai se chamar")).toHaveValue(configuration.name);
    expect(screen.getByLabelText("As regras da casa (opcional)")).toHaveValue(configuration.regras_da_casa);
    expect(screen.getByRole("radio", { name: /Curto e prático/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    await waitFor(() => expect(mocks.salvar).toHaveBeenCalledWith({ expected_context: context, expected_revision: 3, configuration }));
    expect(await screen.findByRole("status")).toHaveTextContent("Nenhum atendimento foi ativado");
    expect(mocks.criar).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Como ele vai se chamar"), { target: { value: "Novo nome QA" } });
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    await waitFor(() => expect(mocks.salvar).toHaveBeenLastCalledWith({ expected_context: context, expected_revision: 4, configuration: { ...configuration, name: "Novo nome QA" } }));
  });

  it("preserva os campos locais quando outra aba já salvou", async () => {
    mocks.salvar.mockResolvedValue({ ok: false, error: "draft_conflict" });
    render(<SetupAiForm capacidades={[]} conferencias={[]} rascunhoInicial={{ ok: true, context, draft: null }} />);
    fireEvent.change(screen.getByLabelText("Como ele vai se chamar"), { target: { value: "Meu trabalho QA" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar rascunho" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("outra aba");
    expect(screen.getByLabelText("Como ele vai se chamar")).toHaveValue("Meu trabalho QA");
    expect(mocks.criar).not.toHaveBeenCalled();
  });

  it("não permite substituir um rascunho que falhou ao carregar", () => {
    render(<SetupAiForm capacidades={[]} conferencias={[]} rascunhoInicial={{ ok: false, error: "db_error" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("carregar");
    expect(screen.getByRole("button", { name: "Salvar rascunho" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Criar e continuar" })).toBeNull();
  });
});
