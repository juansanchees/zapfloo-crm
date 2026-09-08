import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { TestPanel } from "@/app/app/ai/agents/[id]/_components/TestPanel";
import { RunTrace } from "@/app/app/ai/agents/[id]/_components/RunTrace";

it("explica antes da execução que o teste não valida operações de ferramentas", () => {
  render(<QueryClientProvider client={new QueryClient()}><TestPanel
    agent={{ id: "agent" } as never}
    draft={{ id: "version", version_number: 1, status: "draft", provider: "openai", model: "qa" } as never}
    published={null}
  /></QueryClientProvider>);
  expect(screen.getByText(/Ferramentas não são executadas/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Executar teste" })).toBeEnabled();
});

it("distingue chamadas repetidas da mesma ferramenta na mesma etapa", () => {
  const warning = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    render(<RunTrace toolCalls={[{ step: 0, tool_calls: [
      { tool_name: "repeated_tool", result: "primeira recusa" },
      { tool_name: "repeated_tool", result: "segunda recusa" },
    ] }]} />);
    expect(screen.getAllByText("repeated_tool")).toHaveLength(2);
    expect(warning).not.toHaveBeenCalled();
  } finally { warning.mockRestore(); }
});

it("mostra chamadas agrupadas pelo serializador do runtime e preserva o formato plano", () => {
  render(<RunTrace toolCalls={[
    { step: 0, tool_calls: [{ tool_name: "crm_send_whatsapp_message", args: {}, result: { error: "dry_run_tool_blocked", executed: false } }] },
    { step: 1, tool_calls: [] },
    { step: 2, tool_name: "legacy_flat", result: { ok: true } },
    null,
  ]} />);
  expect(screen.getByText("crm_send_whatsapp_message")).toBeVisible();
  expect(screen.getByText("legacy_flat")).toBeVisible();
  expect(screen.queryByText("(sem nome)")).not.toBeInTheDocument();
  expect(screen.getByText(/dry_run_tool_blocked/)).toBeInTheDocument();
});
