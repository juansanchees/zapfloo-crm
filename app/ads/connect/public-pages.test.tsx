import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  configuracaoOAuth: vi.fn(),
  lerPaginaDoLink: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@sentry/nextjs/config", () => ({
  withSentryConfig: <T,>(config: T) => config,
}));
vi.mock("@/lib/plataformas-de-anuncio/meta/oauth/config", () => ({ configuracaoOAuth: mocks.configuracaoOAuth }));
vi.mock("@/lib/plataformas-de-anuncio/meta/oauth/servico", () => ({
  lerPaginaDoLink: mocks.lerPaginaDoLink,
}));

import PaginaDoLink, { generateMetadata as metadataDoLink } from "./[token]/page";
import PaginaDoResultado, { generateMetadata as metadataDoResultado } from "./result/page";
import { idiomaDaRequisicao } from "./_idioma";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.headers.mockResolvedValue(new Headers({ "accept-language": "pt-BR" }));
  mocks.configuracaoOAuth.mockReturnValue({ appId: "configurado" });
  mocks.lerPaginaDoLink.mockResolvedValue({ ok: true, nome: "Negócio de teste" });
});

describe("páginas públicas do consentimento de anúncios", () => {
  it("só entrega o nome autorizado e o botão; abrir o link não envia o formulário", async () => {
    const { container } = render(await PaginaDoLink({ params: Promise.resolve({ token: "link-assinado-de-teste" }) }));

    expect(mocks.lerPaginaDoLink).toHaveBeenCalledExactlyOnceWith("link-assinado-de-teste");
    expect(screen.getByRole("heading", { name: "Negócio de teste" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Conectar com Facebook" })).toHaveAttribute("type", "submit");
    expect(container.querySelector("form")).toHaveAttribute("method", "post");
    expect(container.querySelector("form")).toHaveAttribute("action", "/api/v1/ads/meta/oauth/agency");
    expect(container.querySelector('input[name="link"]')).toHaveAttribute("type", "hidden");
    expect(container.querySelector('input[name="link"]')).toHaveValue("link-assinado-de-teste");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(container.textContent).toBe("Negócio de testeConectar com Facebook");
  });

  it("um link recusado não entrega nome nem formulário", async () => {
    mocks.lerPaginaDoLink.mockResolvedValue({ ok: false });
    const { container } = render(await PaginaDoLink({ params: Promise.resolve({ token: "invalido" }) }));

    expect(screen.getByRole("status")).toHaveTextContent("Este link de conexão está indisponível.");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector("form")).toBeNull();
    expect(container.textContent).not.toContain("Negócio de teste");
  });

  it("configuração indisponível impede até a leitura do nome", async () => {
    mocks.configuracaoOAuth.mockReturnValue(null);

    render(await PaginaDoLink({ params: Promise.resolve({ token: "link-assinado-de-teste" }) }));

    expect(mocks.lerPaginaDoLink).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("A conexão está temporariamente indisponível.");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("o resultado ignora estado não reconhecido e não mostra link administrativo ou parâmetro externo", async () => {
    const { container } = render(await PaginaDoResultado({
      searchParams: Promise.resolve({ status: "<script>dados-do-cliente</script>" }),
    }));

    expect(screen.getByRole("heading", { name: "Não foi possível conectar" })).toBeInTheDocument();
    expect(container.textContent).not.toContain("dados-do-cliente");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(mocks.lerPaginaDoLink).not.toHaveBeenCalled();
  });

  it("cancelamento pede novo link porque a primeira autorização já consumiu o anterior", async () => {
    render(await PaginaDoResultado({ searchParams: Promise.resolve({ status: "cancelado" }) }));
    expect(screen.getByRole("status")).toHaveTextContent("Peça um novo link à pessoa responsável para tentar novamente.");
  });

  it("metadata não indexa nem consulta o nome da organização", async () => {
    for (const gerar of [metadataDoLink, metadataDoResultado]) {
      const metadata = await gerar();
      expect(metadata.robots).toEqual({ index: false, follow: false });
      expect(metadata.title).toEqual({ absolute: "Conectar com Facebook" });
    }
    expect(mocks.lerPaginaDoLink).not.toHaveBeenCalled();
  });

  it("a página do link preserva Origin no POST sem enviar a capacidade no Referer", async () => {
    expect((await metadataDoLink()).referrer).toBe("strict-origin");
  });

  it("a página de resultado continua sem enviar Referer", async () => {
    expect((await metadataDoResultado()).referrer).toBe("no-referrer");
  });

  it("o header protege o link antes da metadata chegar e sobrescreve só a política dessas páginas", async () => {
    const { default: nextConfig } = await import("../../../next.config");
    const regras = await nextConfig.headers!();
    const global = regras.findIndex((regra) => regra.source === "/(.*)");
    const publico = regras.findIndex((regra) => regra.source === "/ads/connect/:path*");

    expect(global).toBeGreaterThanOrEqual(0);
    expect(regras[global]?.headers).toContainEqual({
      key: "Referrer-Policy", value: "strict-origin-when-cross-origin",
    });
    expect(publico).toBeGreaterThan(global);
    expect(regras[publico]?.headers).toEqual([
      { key: "Referrer-Policy", value: "strict-origin" },
    ]);
  });

  it.each([
    "/api/v1/ads/meta/oauth/:path*",
    "/ads/connect/result",
  ])("%s mantém no-referrer depois das políticas mais amplas", async (source) => {
    const { default: nextConfig } = await import("../../../next.config");
    const regras = await nextConfig.headers!();
    const global = regras.findIndex((regra) => regra.source === "/(.*)");
    const publico = regras.findIndex((regra) => regra.source === "/ads/connect/:path*");
    const privado = regras.findIndex((regra) => regra.source === source);

    expect(global).toBeGreaterThanOrEqual(0);
    expect(publico).toBeGreaterThan(global);
    expect(privado).toBeGreaterThan(publico);
    expect(regras[privado]?.headers).toEqual([
      { key: "Referrer-Policy", value: "no-referrer" },
    ]);
  });
});

describe("idioma público sem sessão", () => {
  it.each([
    ["es-MX,pt-BR;q=0.8", "es"],
    ["es;q=0,pt-BR;q=0.5", "pt-BR"],
    ["pt-BR;q=0.5,es-ES;q=0.9", "es"],
    ["en-US,en;q=0.9", "pt-BR"],
  ])("%s resolve %s sem consultar organização", async (acceptLanguage, esperado) => {
    mocks.headers.mockResolvedValue(new Headers({ "accept-language": acceptLanguage }));
    expect(await idiomaDaRequisicao()).toBe(esperado);
    expect(mocks.lerPaginaDoLink).not.toHaveBeenCalled();
  });
});
