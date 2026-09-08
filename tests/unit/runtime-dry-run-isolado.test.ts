import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { PickToolsInput } from "@/lib/ai/runtime/tools";

// Fronteiras de I/O: o runtime, a ponte, o catálogo, o serializador e a
// finalização são reais. Nenhum banco/provedor/transportador externo é usado.
const state = vi.hoisted(() => ({
  dry: true, effects: [] as string[], updates: [] as Record<string, unknown>[],
  events: [] as unknown[],
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/mcp/audit", () => ({ auditMcpToolCall: vi.fn() }));
vi.mock("@/lib/ai/credentials", () => ({
  loadCredential: async () => ({ provider: "openai", apiKey: "synthetic-local-only" }),
  CredentialUnavailableError: class extends Error {},
}));
vi.mock("@/lib/ai/runtime/mcp_token", () => ({
  mintEphemeralToken: async () => ({ id: "token-local" }),
  revokeEphemeralToken: async () => {},
}));
vi.mock("@/lib/ai/runtime/cost", () => ({ computeCostCents: async () => 0 }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (...args: unknown[]) => { state.events.push(args); return { error: null }; },
    from: (table: string) => {
      const query = {
        select: () => query, eq: () => query,
        update: (row: Record<string, unknown>) => { state.updates.push(row); return query; },
        maybeSingle: async () => ({ data: table === "ai_agent_runs" ? {
          id: "run", organization_id: "org", agent_id: "agent", agent_version_id: "version",
          conversation_id: null, contact_id: null, inbound_message_id: "message",
          channel_session_id: null, status: "pending", is_dry_run: state.dry,
        } : table === "ai_agent_versions" ? {
          id: "version", organization_id: "org", agent_id: "agent", system_prompt: "Teste local",
          provider: "openai", model: "qa-local", credential_id: "credential",
          tool_ids: ["crm_search_contacts"], handoff_keywords: [], handoff_tool_enabled: false,
          max_steps: 3, token_budget: 1000, cost_budget_cents: 100,
          pipeline_ids: [], created_by: "owner",
        } : table === "messages" ? { body: "Consulta sintética" } : { id: "agent", created_by: "owner" } }),
      };
      return query;
    },
  }),
}));
vi.mock("ai", async original => ({
  ...await original<typeof import("ai")>(),
  generateText: async ({ tools }: { tools: Record<string, { execute: (args: unknown) => Promise<unknown> }> }) => {
    const output = await tools.crm_search_contacts!.execute({ query: "QA" });
    return { text: "Resposta local", finishReason: "stop", steps: [{
      usage: { inputTokens: 1, outputTokens: 1 },
      toolCalls: [{ toolName: "crm_search_contacts", input: { query: "QA" } }],
      toolResults: [{ toolName: "crm_search_contacts", output }],
    }] };
  },
}));

import { allTools, getToolByName } from "@/lib/mcp/tools";
import { pickToolsFromMcp } from "@/lib/ai/runtime/tools";
import { runAgent } from "@/lib/ai/runtime/agent";

function input(dry: boolean): PickToolsInput & { isDryRun: boolean } {
  const actor = { type: "ai_agent" as const, id: "run", role: "ai_operator" as const };
  return {
    isDryRun: dry, supabase: {} as never,
    ctx: { organizationId: "org", role: "ai_operator", actor, apiTokenId: "local", requestId: "run", supabase: {} as never },
    auth: { organizationId: "org", role: "ai_operator", actor, apiTokenId: "local", scopes: ["mcp:read", "mcp:write"] },
    toolIds: allTools.map(t => t.name), handoffToolEnabled: true,
    pipelineIds: [], handoffSignal: { triggered: false },
  };
}

beforeEach(() => {
  state.dry = true; state.effects = []; state.updates = []; state.events = [];
  for (const def of allTools) vi.spyOn(def, "handler").mockImplementation(async () => {
    state.effects.push(def.name); return { ok: true } as never;
  });
});
afterEach(() => vi.restoreAllMocks());

describe("dry-run legado não executa ferramentas reais", () => {
  it("recusa todas as ferramentas montadas, inclusive leitura, escrita e handoff auto-injetado", async () => {
    const config = input(true);
    config.toolIds = config.toolIds.filter(id => id !== "crm_request_human_handoff");
    const tools = pickToolsFromMcp(config);
    expect(tools).toHaveProperty("crm_request_human_handoff");
    expect(tools).toHaveProperty("crm_send_whatsapp_message");
    expect(tools).toHaveProperty("crm_search_contacts");
    for (const [name, tool] of Object.entries(tools)) {
      const output = await tool.execute!({}, { toolCallId: "local", messages: [], context: {} });
      expect(output, name).toMatchObject({ error: "dry_run_tool_blocked", executed: false });
    }
    expect(state.effects).toEqual([]);
    expect(config.handoffSignal.triggered).toBe(false);
  });

  it("execução normal continua alcançando o handler autorizado", async () => {
    const tools = pickToolsFromMcp(input(false));
    await tools.crm_search_contacts!.execute!({ query: "QA" }, { toolCallId: "local", messages: [], context: {} });
    expect(state.effects).toEqual(["crm_search_contacts"]);
  });

  it("runAgent transmite dry-run da linha confiável e persiste recusa no trace", async () => {
    const result = await runAgent({ runId: "run", override: { sampleMessage: "Consulta sintética" } });
    expect(result.status).toBe("completed");
    expect(state.effects).toEqual([]);
    expect(result.tool_calls?.[0]?.tool_calls[0]?.result).toMatchObject({ error: "dry_run_tool_blocked", executed: false });
    expect(state.updates.at(-1)).toMatchObject({ status: "completed", outbound_message_id: null });
  });

  it("dry-run mantém registro da execução mas não emite eventos para automações", async () => {
    await runAgent({ runId: "run", override: { sampleMessage: "Consulta sintética" } });
    expect(state.updates.at(-1)).toMatchObject({ status: "completed" });
    expect(state.events).toEqual([]);
  });

  it("execução normal conserva ferramentas e eventos de início/conclusão", async () => {
    state.dry = false;
    expect(getToolByName("crm_search_contacts")).toBeDefined();
    const result = await runAgent({ runId: "run" });
    expect(result.status).toBe("completed");
    expect(state.effects).toEqual(["crm_search_contacts"]);
    expect(state.events).toHaveLength(2);
  });
});
