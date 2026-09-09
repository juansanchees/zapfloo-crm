import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CopilotPage } from "@/components/ai/copilot/CopilotPage";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        data: {
          answer: "Existem 3 oportunidades abertas e 1 precisa de atenção.",
          sources: [
            { kind: "lead", label: "Oportunidades", href: "/app/kanban" },
            { kind: "risk", label: "Radar", href: "/app/radar" },
          ],
          consulted_tools: ["crm_list_leads", "crm_list_at_risk_leads"],
        },
      }),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Pergunte à IA", () => {
  it("envia pelo teclado, mostra resposta e fontes consultadas", async () => {
    render(<CopilotPage />);
    const input = screen.getByRole("textbox", { name: "Pergunta sobre o CRM" });
    await userEvent.type(input, "Quais clientes precisam de atenção?{enter}");

    expect(await screen.findByText(/Existem 3 oportunidades abertas/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Oportunidades" })).toHaveAttribute(
      "href",
      "/app/kanban",
    );
    expect(screen.getByRole("link", { name: "Radar" })).toHaveAttribute("href", "/app/radar");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/v1/ai/ask",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("não oferece nenhuma ação de escrita no CRM", () => {
    render(<CopilotPage />);
    expect(screen.queryByRole("button", { name: /enviar mensagem/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /mover oportunidade/i })).toBeNull();
    expect(screen.getByText(/somente leitura/i)).toBeVisible();
  });
});
