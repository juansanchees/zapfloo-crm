import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MetaAdsSettingsPage from "./page";

const { auth, org, exists, config, oauth } = vi.hoisted(() => ({ auth: vi.fn(), org: vi.fn(), exists: vi.fn(), config: vi.fn(), oauth: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ requireAuth: auth, resolveActiveOrg: org }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/plataformas-de-anuncio/credenciais-de-leitura", () => ({ existeConexaoDeLeitura: exists }));
vi.mock("@/lib/plataformas-de-anuncio/meta/oauth/config", () => ({ configuracaoOAuth: config }));
vi.mock("./_form", () => ({ FormularioDeMetaAds: () => <div data-testid="manual">Token de acesso</div> }));
vi.mock("./_oauth", () => ({ ConexaoOAuthMetaAds: (props: Record<string, unknown>) => { oauth(props); return props.habilitada ? <button>Conectar com Facebook</button> : null; } }));

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ is_platform_admin: false, idioma: "pt-BR" });
  org.mockResolvedValue({ orgId: "org-teste", role: "admin" });
  exists.mockResolvedValue({ conectada: false, contaPadrao: null });
  config.mockReturnValue({ appId: "app-teste", appSecret: "segredo-nao-serializavel" });
});
afterEach(cleanup);

describe("porta de configuração da autorização de anúncios", () => {
  it("admin recebe OAuth e configuração manual recolhida em Avançado", async () => {
    const { container } = render(await MetaAdsSettingsPage());
    expect(screen.getByRole("button", { name: "Conectar com Facebook" })).toBeInTheDocument();
    const manual = screen.getByTestId("manual").closest("details");
    expect(manual).not.toHaveAttribute("open");
    expect(manual?.querySelector("summary")).toHaveTextContent("Avançado");
    expect(oauth).toHaveBeenCalledWith(expect.objectContaining({ habilitada: true, conectada: false, contaPadrao: null }));
    expect(JSON.stringify(oauth.mock.calls)).not.toContain("segredo-nao-serializavel");
    expect(container.textContent).not.toContain("segredo-nao-serializavel");
  });

  it("sem configuração de instalação mantém o manual direto e remove OAuth", async () => {
    config.mockReturnValue(null);
    render(await MetaAdsSettingsPage());
    expect(screen.queryByRole("button", { name: "Conectar com Facebook" })).not.toBeInTheDocument();
    expect(screen.getByTestId("manual").closest("details")).toBeNull();
    expect(oauth).toHaveBeenCalledWith(expect.objectContaining({ habilitada: false }));
  });

  it("manager pode autorizar e selecionar contas mas não recebe escrita manual", async () => {
    org.mockResolvedValue({ orgId: "org-teste", role: "manager" });
    render(await MetaAdsSettingsPage());
    expect(screen.getByRole("button", { name: "Conectar com Facebook" })).toBeInTheDocument();
    expect(screen.queryByTestId("manual")).not.toBeInTheDocument();
  });

  it.each(["viewer", "agent"])("recusa a tela para %s antes de ler a conexão", async (role) => {
    org.mockResolvedValue({ orgId: "org-teste", role });
    await expect(MetaAdsSettingsPage()).rejects.toThrow("redirect:/403");
    expect(exists).not.toHaveBeenCalled();
    expect(config).not.toHaveBeenCalled();
  });

  it("retorno OAuth aceita somente o estado conhecido e não serializa conteúdo arbitrário", async () => {
    render(await MetaAdsSettingsPage({ searchParams: Promise.resolve({ oauth: "segredo-injetado" }) }));
    expect(oauth).toHaveBeenCalledWith(expect.objectContaining({ resultado: undefined }));
  });

  it("encaminha o retorno cancelado para a mensagem de recuperação", async () => {
    render(await MetaAdsSettingsPage({ searchParams: Promise.resolve({ oauth: "cancelado" }) }));
    expect(oauth).toHaveBeenCalledWith(expect.objectContaining({ resultado: "cancelado" }));
  });
});
