import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as ModuloClienteApi from "@/lib/api/client";

import { ConexaoOAuthMetaAds } from "./_oauth";
import { FormularioDeMetaAds } from "./_form";

const { get, post, patch, refresh, update, disconnect } = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), patch: vi.fn(), refresh: vi.fn(), update: vi.fn(), disconnect: vi.fn(),
}));
vi.mock("@/lib/api/client", () => ({ apiClient: { get, post, patch } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/actions/settings/updateAdInsightsConnection", () => ({ updateAdInsightsConnection: update, disconnectAdInsights: disconnect }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const props = { habilitada: true, conectada: false, contaPadrao: null, idioma: "pt-BR" as const };

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("conexão de anúncios pela autorização", () => {
  it("sem configuração esconde Facebook e link, mantendo o formulário manual utilizável", () => {
    render(<><ConexaoOAuthMetaAds {...props} habilitada={false} /><FormularioDeMetaAds conectada={false} contaPadrao={null} idioma="pt-BR" /></>);
    expect(screen.queryByRole("button", { name: "Conectar com Facebook" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gerar link de conexão" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Token de acesso"), { target: { value: "token-de-teste-com-mais-de-vinte" } });
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
    expect(post).not.toHaveBeenCalled();
  });

  it("os campos manuais não parecem login, senha salva ou e-mail", () => {
    render(<FormularioDeMetaAds conectada={false} contaPadrao={null} idioma="pt-BR" />);
    const token = screen.getByLabelText("Token de acesso");
    expect(token).toHaveAttribute("type", "password");
    expect(token).toHaveAttribute("autocomplete", "new-password");
    expect(token).toHaveAttribute("name", "meta_ads_access_token");
    const conta = screen.getByLabelText("Conta padrão (opcional)");
    expect(conta).toHaveAttribute("type", "text");
    expect(conta).toHaveAttribute("autocomplete", "off");
    expect(conta).toHaveAttribute("inputmode", "text");
    expect(conta).toHaveAttribute("name", "meta_ads_default_account_id");
  });

  it("conecta por POST de navegação, sem expor credencial no formulário", () => {
    const { container } = render(<ConexaoOAuthMetaAds {...props} />);
    const form = screen.getByRole("button", { name: "Conectar com Facebook" }).closest("form");
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/api/v1/ads/meta/oauth/connect");
    expect(container.querySelector('input[type="hidden"]')).toBeNull();
    expect(container.querySelector('input[type="password"]')).toBeNull();
  });

  it("mostra o link e a validade gerados pelo servidor sem repetir a mutação", async () => {
    post.mockResolvedValue({ data: { url: "https://crm.example/ads/connect/teste", expires_at: "2026-09-15T15:00:00Z" } });
    render(<ConexaoOAuthMetaAds {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Gerar link de conexão" }));
    expect(await screen.findByLabelText("Link para quem cuida dos anúncios")).toHaveValue("https://crm.example/ads/connect/teste");
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/api/v1/ads/meta/oauth/links", {}, { retry: false });
    expect(screen.getByText(/Este link expira em/)).toBeInTheDocument();
  });

  it("clipboard indisponível mantém o link selecionável e explica como copiar", async () => {
    post.mockResolvedValue({ data: { url: "https://crm.example/ads/connect/teste", expires_at: "2026-09-15T15:00:00Z" } });
    vi.stubGlobal("navigator", { clipboard: undefined });
    render(<ConexaoOAuthMetaAds {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Gerar link de conexão" }));
    await screen.findByLabelText("Link para quem cuida dos anúncios");
    fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não consegui copiar automaticamente. Selecione e copie o link exibido.");
    expect(screen.getByLabelText("Link para quem cuida dos anúncios")).toHaveValue("https://crm.example/ads/connect/teste");
  });

  it("copia o link pelo fallback canônico quando a API de área de transferência está ausente", async () => {
    post.mockResolvedValue({ data: { url: "https://crm.example/ads/connect/teste", expires_at: "2026-09-15T15:00:00Z" } });
    vi.stubGlobal("navigator", {});
    const anterior = Object.getOwnPropertyDescriptor(document, "execCommand");
    const executar = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", { configurable: true, value: executar });
    try {
      render(<ConexaoOAuthMetaAds {...props} />);
      fireEvent.click(screen.getByRole("button", { name: "Gerar link de conexão" }));
      await screen.findByLabelText("Link para quem cuida dos anúncios");
      fireEvent.click(screen.getByRole("button", { name: "Copiar link" }));
      expect(await screen.findByRole("status")).toHaveTextContent("Link de conexão copiado.");
      expect(executar).toHaveBeenCalledExactlyOnceWith("copy");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(document.querySelector("textarea")).toBeNull();
    } finally {
      if (anterior) Object.defineProperty(document, "execCommand", anterior);
      else Reflect.deleteProperty(document, "execCommand");
    }
  });

  it("contas vêm da API e salvar a padrão não envia token", async () => {
    get.mockResolvedValue({ data: { contas: [{ id: "act_123", nome: "Conta teste", moeda: "BRL", status: 1 }], conta_padrao: null } });
    patch.mockResolvedValue({ data: { ok: true } });
    render(<ConexaoOAuthMetaAds {...props} conectada />);
    const selector = await screen.findByLabelText("Conta de anúncios padrão", { selector: "select" });
    fireEvent.change(selector, { target: { value: "act_123" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar conta padrão" }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/v1/ads/meta/account", { default_account_id: "act_123" }, { timeoutMs: 30_000, retry: false }));
    expect(await screen.findByRole("status")).toHaveTextContent("Conta padrão salva.");
    expect(update).not.toHaveBeenCalled();
  });

  it("confirma a conta padrão após 12 segundos sem abortar nem repetir o PATCH", async () => {
    get.mockResolvedValue({ data: { contas: [{ id: "act_123", nome: "Conta teste", moeda: "BRL", status: 1 }], conta_padrao: null } });
    // Mantém o cliente HTTP real: a regressão precisa detectar o seu timeout,
    // não somente repetir uma expectativa sobre as opções passadas pela UI.
    const real = await vi.importActual<typeof ModuloClienteApi>("@/lib/api/client");
    patch.mockImplementationOnce(real.apiClient.patch);
    render(<ConexaoOAuthMetaAds {...props} conectada />);
    const selector = await screen.findByLabelText("Conta de anúncios padrão", { selector: "select" });
    fireEvent.change(selector, { target: { value: "act_123" } });

    vi.useFakeTimers();
    const transporte = vi.fn((_url: string, opts: RequestInit) => new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => resolve(Response.json({ data: { default_account_id: "act_123" } })), 12_000);
      opts.signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("aborted", "AbortError"));
      }, { once: true });
    }));
    vi.stubGlobal("fetch", transporte);
    fireEvent.click(screen.getByRole("button", { name: "Salvar conta padrão" }));

    await act(async () => { await vi.advanceTimersByTimeAsync(12_100); });

    expect(screen.getByRole("status")).toHaveTextContent("Conta padrão salva.");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(patch).toHaveBeenCalledTimes(1);
    expect(transporte).toHaveBeenCalledTimes(1);
    expect(transporte).toHaveBeenCalledWith("/api/v1/ads/meta/account", expect.objectContaining({
      method: "PATCH", body: JSON.stringify({ default_account_id: "act_123" }),
    }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("falha de geração e retorno OAuth aparecem sem mensagem técnica refletida", async () => {
    post.mockRejectedValue(new Error("segredo-falso-na-resposta"));
    render(<ConexaoOAuthMetaAds {...props} resultado="erro" />);
    expect(screen.getByRole("alert")).toHaveTextContent("A autorização não foi concluída.");
    fireEvent.click(screen.getByRole("button", { name: "Gerar link de conexão" }));
    expect(await screen.findByText("Não consegui gerar o link de conexão. Tente novamente.")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("segredo-falso-na-resposta");
  });

  it("cancelamento mostra a saída e mantém o botão para recomeçar", () => {
    render(<ConexaoOAuthMetaAds {...props} resultado="cancelado" />);
    expect(screen.getByRole("status")).toHaveTextContent("A autorização foi cancelada. Use Conectar com Facebook para começar novamente.");
    expect(screen.getByRole("button", { name: "Conectar com Facebook" })).toBeEnabled();
  });
});
