import { describe, expect, it, vi } from "vitest";

import { runCopilot } from "./run";

describe("execução do copiloto", () => {
  it("usa o seam canônico com limites técnicos e deriva as fontes das tools", async () => {
    const executions = [
      { name: "crm_list_leads" as const, durationMs: 12, success: true },
      { name: "crm_list_pipelines" as const, durationMs: 8, success: false },
    ];
    const modelCall = vi.fn().mockResolvedValue({ result: { text: "Há 3 oportunidades." } });
    const toolsFactory = vi.fn().mockReturnValue({ tools: { crm_list_leads: {} }, executions });

    const result = await runCopilot(
      {
        organizationId: "org-1",
        userId: "user-1",
        role: "agent",
        requestId: "req-1",
        idioma: "pt-BR",
        question: "Quantas oportunidades estão abertas?",
        history: [{ role: "assistant", content: "Como posso ajudar?" }],
        supabase: {} as never,
      },
      {
        pool: {} as never,
        cfg: {},
        modelCall,
        toolsFactory,
      },
    );

    expect(modelCall).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        tenantId: "org-1",
        purpose: "copilot_query",
        maxSteps: 8,
        timeoutMs: 30_000,
        maxOutputTokens: 1_200,
        tools: { crm_list_leads: {} },
        messages: [
          { role: "assistant", content: "Como posso ajudar?" },
          { role: "user", content: "Quantas oportunidades estão abertas?" },
        ],
      }),
    );
    expect(result).toEqual({
      answer: "Há 3 oportunidades.",
      sources: [{ kind: "lead", label: "Oportunidades", href: "/app/kanban" }],
      consulted_tools: ["crm_list_leads"],
    });
  });

  it("recusa resposta vazia do provedor", async () => {
    await expect(
      runCopilot(
        {
          organizationId: "org-1",
          userId: "user-1",
          role: "agent",
          requestId: "req-1",
          idioma: "pt-BR",
          question: "Resumo",
          history: [],
          supabase: {} as never,
        },
        {
          pool: {} as never,
          cfg: {},
          modelCall: vi.fn().mockResolvedValue({ result: { text: "   " } }),
          toolsFactory: vi.fn().mockReturnValue({ tools: {}, executions: [] }),
        },
      ),
    ).rejects.toThrow("empty_response");
  });
});
