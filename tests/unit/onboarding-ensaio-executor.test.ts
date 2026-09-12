import { describe, expect, it, vi } from "vitest";
import { runModelCall } from "@/lib/agent-engine/edge/llm/run-model-call";
import { resolveOrgLlmConfig } from "@/lib/agent-engine/edge/llm/credentials";
import { executarEnsaio } from "@/lib/onboarding/executar-ensaio";

const org = "11111111-1111-4111-8111-111111111111";
function boundary(text = "Resposta sintética do provider.", reason = "stop") {
  const calls: Record<string, unknown>[] = []; const writes: unknown[][] = [];
  const query = vi.fn(async (sql: string, params: unknown[]) => {
    if (sql.includes("settings->'llm'")) return { rows: [{ llm: { provider: "anthropic", default_model: "global", params: { maxOutputTokens: 9000 }, enabled_models: [] } }] };
    if (sql.includes("from ai_provider_credentials")) return { rows: [] };
    if (sql.includes("from ai_purpose_bindings")) return { rows: [{ purpose: "onboarding_rehearsal", provider: "anthropic", model_id: "binding", credential_id: null, base_url: null, is_enabled: true }] };
    if (sql.includes("insert into llm_calls")) { writes.push(params); return { rows: [{ id: "22222222-2222-4222-8222-222222222222" }] }; }
    throw new Error(`Query inesperada: ${sql}`);
  });
  const factory = (provider: string) => (_key: string, modelId: string) => ({
    specificationVersion: "v3", provider, modelId,
    doGenerate: async (options: Record<string, unknown>) => {
      calls.push({ provider, modelId, ...options });
      return { content: [{ type: "text", text }], finishReason: { unified: reason, raw: undefined }, usage: { inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 4, text: 4, reasoning: 0 } }, warnings: [] };
    },
  }) as never;
  return { pool: { query } as never, calls, writes, registry: { openai: factory("openai"), anthropic: factory("anthropic") } };
}
describe("seleção explícita do ensaio na fronteira SDK", () => {
  it("modelo/provider explícitos vencem binding e limite técnico vence params globais", async () => {
    const b = boundary();
    const result = await runModelCall(b.pool, { openaiApiKey: "sintetica", anthropicApiKey: "outra" }, {
      tenantId: org, purpose: "onboarding_rehearsal", model: "modelo-escolhido",
      llmOverride: { provider: "openai", credentialId: null }, selectionMode: "explicit",
      maxOutputTokens: 1200, timeoutMs: 30000, messages: [{ role: "user", content: "Olá" }],
    }, { registry: b.registry });
    expect(b.calls[0]).toMatchObject({ provider: "openai", modelId: "modelo-escolhido", maxOutputTokens: 1200 });
    expect(b.calls[0]?.tools).toBeUndefined();
    expect(b.calls[0]?.abortSignal).toBeDefined();
    expect(result.result.text).toBe("Resposta sintética do provider.");
    expect(b.writes[0]).toContain("onboarding_rehearsal");
    expect(b.writes[0]).toContain("modelo-escolhido");
  });
  it("credencial específica que sumiu não é substituída pela chave da instalação", async () => {
    const b = boundary();
    await expect(resolveOrgLlmConfig(b.pool, { openaiApiKey: "sintetica" }, org, { provider: "openai", credentialId: "33333333-3333-4333-8333-333333333333", strictCredential: true })).rejects.toThrow();
  });
});

const snapshot = { organization_id: org, id: "44444444-4444-4444-8444-444444444444", agent_id: "55555555-5555-4555-8555-555555555555", system_prompt: "Atenda com cuidado", provider: "openai", model: "modelo-escolhido", credential_id: null, status: "draft", channel_session_id: null, tool_ids: ["crm_create_contact"] };
describe("adapter do ensaio só produz prévia de texto", () => {
  it("ignora capacidades do snapshot e registra uso sem invocar ferramentas", async () => {
    const b = boundary();
    expect(await executarEnsaio(snapshot, "Olá", { pool: b.pool, cfg: { openaiApiKey: "sintetica" }, registry: b.registry })).toMatchObject({ ok: true, response: "Resposta sintética do provider.", call_id: expect.any(String) });
    expect(b.calls[0]?.tools).toBeUndefined();
    expect(b.calls[0]?.modelId).toBe("modelo-escolhido");
  });
  it.each([[" ", "stop", "empty_response"], ["Resposta cortada", "length", "incomplete_response"]])("não aprova texto %j com finishReason %s", async (text, reason, error) => {
    const b = boundary(text, reason);
    expect(await executarEnsaio(snapshot, "Olá", { pool: b.pool, cfg: { openaiApiKey: "sintetica" }, registry: b.registry })).toMatchObject({ ok: false, error });
  });
  it("sem chave devolve erro honesto sem texto do provedor", async () => {
    const b = boundary();
    expect(await executarEnsaio(snapshot, "Olá", { pool: b.pool, cfg: {}, registry: b.registry })).toEqual({ ok: false, error: "not_configured", call_id: null });
    expect(b.calls).toHaveLength(0);
  });
});
