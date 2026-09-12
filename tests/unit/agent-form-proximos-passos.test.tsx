import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { AgentForm } from "@/app/app/ai/agents/[id]/_components/AgentForm";
import { CHAVE_DA_INSTALACAO } from "@/lib/ai/agents/configuracao-inicial";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/app/ai/agents/new",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

function montar(
  locale: "pt-BR" | "es" = "pt-BR",
  readOnly = false,
  podeGerenciarCredenciais = false,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <IdiomaProvider locale={locale}>
      <QueryClientProvider client={queryClient}>
        <AgentForm
          mode="create"
          credentials={[]}
          channelSessions={[]}
          readOnly={readOnly}
          podeGerenciarCredenciais={podeGerenciarCredenciais}
        />
      </QueryClientProvider>
    </IdiomaProvider>,
  );
}

describe("próximos passos do formulário de agente", () => {
  it("não oferece cadastro nem conexão a quem só pode ler o agente", () => {
    montar("pt-BR", true);
    expect(screen.queryByRole("link", { name: "Cadastrar credencial de IA" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Conectar número de WhatsApp" })).not.toBeInTheDocument();
  });
  it("não oferece cadastro de credencial ao administrador do tenant", () => {
    montar("pt-BR", false, false);

    expect(screen.queryByRole("link", { name: "Cadastrar credencial de IA" })).not.toBeInTheDocument();
  });

  it("tenant usa uma credencial gerenciada sem ver seletor nem metadados", () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AgentForm
          mode="create"
          credentials={[]}
          channelSessions={[]}
          initialSetup={{
            provider: "openai",
            model: "gpt-5.6-luna",
            credential_id: CHAVE_DA_INSTALACAO,
            tool_ids: [],
            organization_timezone: "America/Sao_Paulo",
          }}
          provedoresDaInstalacao={[]}
          provedoresComCredencialDisponivel={["openai"]}
          podeGerenciarCredenciais={false}
        />
      </QueryClientProvider>,
    );

    expect(screen.queryByLabelText("Chave de acesso")).not.toBeInTheDocument();
    expect(screen.getByText("A chave é administrada pela equipe da plataforma.")).toBeInTheDocument();
    expect(screen.queryByText(/Esta instalação não tem chave de openai/i)).not.toBeInTheDocument();
  });

  it("oferece o cadastro de credencial de IA à plataforma com a lista vazia", () => {
    montar("pt-BR", false, true);

    expect(
      screen.getByRole("link", { name: "Cadastrar credencial de IA" }),
    ).toHaveAttribute("href", "/app/ai/credentials");
  });

  it("oferece a conexão de um número mesmo com a lista vazia", () => {
    montar();

    expect(
      screen.getByRole("link", { name: "Conectar número de WhatsApp" }),
    ).toHaveAttribute("href", "/app/connections");
  });

  it("traduz o caminho de credencial para espanhol sem mudar o destino", () => {
    montar("es", false, true);

    expect(
      screen.getByRole("link", { name: "Registrar credencial de IA" }),
    ).toHaveAttribute("href", "/app/ai/credentials");
  });

  it("traduz o caminho de conexão para espanhol sem mudar o destino", () => {
    montar("es");

    expect(
      screen.getByRole("link", { name: "Conectar un número de WhatsApp" }),
    ).toHaveAttribute("href", "/app/connections");
  });
});
