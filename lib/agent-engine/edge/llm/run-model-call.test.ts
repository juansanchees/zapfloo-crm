import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({
  generateText: vi.fn(),
  stepCountIs: vi.fn(),
  tool: vi.fn(),
}));

import { generateText } from "ai";
import { runModelCall } from "./run-model-call";

const ORG = "11111111-1111-4111-8111-111111111111";
const cfg = { anthropicApiKey: "chave-de-teste", cacheTtl: "1h" as const };

function poolFalso() {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("settings->'llm'")) {
        return {
          rows: [{
            llm: {
              provider: "anthropic",
              default_model: "claude-padrao",
              params: {},
              enabled_models: [],
              monthly_budget_cents: null,
            },
          }],
        };
      }
      if (sql.includes("from ai_purpose_bindings") || sql.includes("from ai_provider_credentials")) {
        return { rows: [] };
      }
      if (sql.includes("insert into llm_calls")) return { rows: [{ id: "call-1" }] };
      return { rows: [] };
    }),
  } as never;
}

const registry = {
  anthropic: () => ({}) as never,
  openai: () => ({}) as never,
  openrouter: () => ({}) as never,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runModelCall — retries físicos por chamada", () => {
  it("draft_suggestion repassa maxRetries: 0 ao AI SDK e erro retryable só inicia uma geração", async () => {
    const retryableError = Object.assign(new Error("provider temporarily unavailable"), { status: 503 });
    vi.mocked(generateText).mockRejectedValue(retryableError);

    await expect(
      runModelCall(
        poolFalso(),
        cfg,
        {
          tenantId: ORG,
          purpose: "draft_suggestion",
          maxRetries: 0,
          messages: [{ role: "user", content: "oi" }],
        },
        { registry },
      ),
    ).rejects.toBe(retryableError);

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(vi.mocked(generateText).mock.calls[0]?.[0]).toMatchObject({ maxRetries: 0 });
  });

  it("consumidor sem override mantém o default de retry do AI SDK", async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: "ok",
      finishReason: "stop",
      usage: {
        inputTokens: 1,
        outputTokens: 1,
        inputTokenDetails: { cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
    } as never);

    await runModelCall(
      poolFalso(),
      cfg,
      { tenantId: ORG, purpose: "agent_turn", messages: [{ role: "user", content: "oi" }] },
      { registry },
    );

    expect(vi.mocked(generateText).mock.calls[0]?.[0]).not.toHaveProperty("maxRetries");
  });
});
