import { describe, expect, it, vi } from "vitest";

import { TOOL_CATALOG } from "@/lib/mcp/tools/catalog";
import { getToolByName } from "@/lib/mcp/tools";
import { COPILOT_TOOL_NAMES, createCopilotTools, sourcesFromExecutions } from "./tools";

vi.mock("@/lib/audit", () => ({ audit: vi.fn().mockResolvedValue(undefined) }));

describe("ferramentas do copiloto", () => {
  it("expõe somente uma allowlist explícita de leituras seguras", () => {
    expect(COPILOT_TOOL_NAMES.length).toBeGreaterThan(0);
    for (const name of COPILOT_TOOL_NAMES) {
      const handler = getToolByName(name);
      const metadata = TOOL_CATALOG.find((entry) => entry.name === name);
      expect(handler?.category, name).toBe("read");
      expect(handler?.requiresScope, name).toBe("mcp:read");
      expect(metadata?.risco, name).toBe("seguro");
      expect(metadata?.apenasHumano, name).not.toBe(true);
    }
  });

  it("não inclui ferramentas de escrita mesmo quando existem no catálogo", () => {
    expect(COPILOT_TOOL_NAMES).not.toContain("crm_send_whatsapp_message");
    expect(COPILOT_TOOL_NAMES).not.toContain("crm_move_lead_stage");
    expect(COPILOT_TOOL_NAMES).not.toContain("crm_create_lead");
  });

  it("executa com o tenant e o ator reais e deriva fontes da execução", async () => {
    const original = getToolByName("crm_list_pipelines");
    if (!original) throw new Error("fixture ausente");
    const handler = vi.spyOn(original, "handler").mockResolvedValue({ pipelines: [] });
    const { tools, executions } = createCopilotTools({
      organizationId: "org-1",
      userId: "user-1",
      role: "agent",
      requestId: "req-1",
      supabase: {} as never,
    });

    const callable = tools.crm_list_pipelines;
    if (!callable?.execute) throw new Error("tool não executável");
    const execute = callable.execute as unknown as (
      raw: unknown,
      options: {
        toolCallId: string;
        messages: never[];
        abortSignal: AbortSignal;
        context: unknown;
      },
    ) => Promise<unknown>;
    await execute(
      {},
      {
        toolCallId: "call-1",
        messages: [],
        abortSignal: new AbortController().signal,
        context: undefined,
      },
    );

    expect(handler).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        organizationId: "org-1",
        role: "agent",
        actor: { type: "user", id: "user-1", role: "agent" },
      }),
    );
    expect(executions).toEqual([
      expect.objectContaining({ name: "crm_list_pipelines", success: true }),
    ]);
    expect(sourcesFromExecutions(executions)).toEqual([
      { kind: "pipeline", label: "Funis", href: "/app/kanban" },
    ]);
  });
});
