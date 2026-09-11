import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { AgentForm } from "@/app/app/ai/agents/[id]/_components/AgentForm";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/app/ai/agents/new",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

function montar(locale: "pt-BR" | "es" = "pt-BR", readOnly = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <IdiomaProvider locale={locale}>
      <QueryClientProvider client={queryClient}>
        <AgentForm mode="create" credentials={[]} channelSessions={[]} readOnly={readOnly} />
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
  it("oferece o cadastro de credencial de IA mesmo com a lista vazia", () => {
    montar();

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
    montar("es");

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
