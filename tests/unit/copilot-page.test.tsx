import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  vi.useRealTimers();
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

  it("mostra uma resposta que leva 12 segundos sem abortar nem repetir o POST", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      (_url: string, opts: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          const timer = setTimeout(
            () =>
              resolve(
                Response.json({
                  data: {
                    answer: "A análise longa chegou ao usuário.",
                    sources: [],
                    consulted_tools: [],
                  },
                }),
              ),
            12_000,
          );
          opts.signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    vi.stubGlobal("fetch", fetch);

    render(<CopilotPage />);
    const input = screen.getByRole("textbox", { name: "Pergunta sobre o CRM" });
    fireEvent.change(input, { target: { value: "Analise meu CRM por completo" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_100);
    });

    expect(screen.getByText("A análise longa chegou ao usuário.")).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("não repete o POST quando o provedor de IA está indisponível", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () =>
      Response.json(
        { error: { code: "ai_unavailable", message: "Provedor indisponível" } },
        { status: 503 },
      ),
    );
    vi.stubGlobal("fetch", fetch);

    render(<CopilotPage />);
    const input = screen.getByRole("textbox", { name: "Pergunta sobre o CRM" });
    fireEvent.change(input, { target: { value: "Mostre os riscos de hoje" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Provedor indisponível");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
