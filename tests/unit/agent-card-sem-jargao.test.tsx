import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/app/ai/agents/_components/AgentRowMenu", () => ({ AgentRowMenu: () => null }));

import { AgentCard } from "@/app/app/ai/agents/_components/AgentCard";
import type { AgentRow } from "@/hooks/ai/useAgent";

afterEach(cleanup);

const agente = {
  id: "agent-1",
  name: "Recepção da clínica",
  description: "Atende e organiza os novos pacientes",
  kind: "mcp_agent",
  priority: 0,
  model: "gpt-5.6-luna",
  is_active: true,
  is_default: true,
  archived_at: null,
  published_version_id: "version-1",
  versao_publicada: { provider: "openai", model: "gpt-5.6-luna" },
} as unknown as AgentRow;

describe("primeira impressão da lista de agentes", () => {
  it("mantém identidade e ação, sem identificadores técnicos no cartão", () => {
    render(<AgentCard agent={agente} canWrite />);

    expect(screen.getByText("Recepção da clínica")).toBeInTheDocument();
    expect(screen.getByText("Atende e organiza os novos pacientes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
    expect(screen.queryByText("mcp_agent")).not.toBeInTheDocument();
    expect(screen.queryByText("Prioridade")).not.toBeInTheDocument();
    expect(screen.queryByText(/gpt-5\.6-luna/i)).not.toBeInTheDocument();
    expect(screen.getByText("Padrão")).toBeInTheDocument();
    expect(screen.queryByText("default")).not.toBeInTheDocument();
  });
});
