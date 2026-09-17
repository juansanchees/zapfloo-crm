import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { generateDraftReply } from "@/lib/agent-engine/agent/draft-reply";
import { createClient } from "@/lib/supabase/server";
import { fail } from "@/lib/api/wrappers";
import { LlmNotConfiguredError } from "@/lib/agent-engine/edge/llm/run-model-call";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/agent-engine/agent/draft-reply", () => ({ generateDraftReply: vi.fn() }));
vi.mock("@/lib/agent-engine/db/request-pool", () => ({ getRequestPool: vi.fn(() => ({})) }));
vi.mock("@/lib/agent-engine/edge/crm/mcp-client", () => ({ crmEdgeConfigFromEnv: vi.fn(() => ({})) }));
vi.mock("@/lib/agent-engine/edge/llm/run-model-call", () => ({
  llmEdgeConfigFromEnv: vi.fn(() => ({})),
  normalizarErro: vi.fn((error: unknown) => ({
    error_code: error instanceof Error && /invalid api key/i.test(error.message) ? "credencial_recusada" : "erro_desconhecido",
  })),
  LlmNotConfiguredError: class LlmNotConfiguredError extends Error {},
}));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_SUPABASE_URL: "http://example.test", SUPABASE_SERVICE_ROLE_KEY: "secret" } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/i18n/dicionario", () => ({ traduzir: (text: string) => text }));

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const CONVERSATION_ID = "33333333-3333-4333-8333-333333333333";
const filters: Record<string, unknown> = {};

function request() {
  return new NextRequest(`http://localhost/api/v1/conversations/${CONVERSATION_ID}/draft-reply`, { method: "POST" });
}

function context(id = CONVERSATION_ID) {
  return { params: Promise.resolve({ id }) };
}

function mockConversation(found = true) {
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return query;
    },
    maybeSingle: async () => ({
      data: found
        ? { id: CONVERSATION_ID, organization_id: ORG_ID, contact_id: "contact-1", channel_session_id: "channel-1" }
        : null,
      error: null,
    }),
  };
  vi.mocked(createClient).mockResolvedValue({ from: () => query } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(filters)) delete filters[key];
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: "user-1", idioma: "pt-BR" },
    org: { orgId: ORG_ID, role: "agent" },
  } as never);
  mockConversation();
  vi.mocked(generateDraftReply).mockResolvedValue({ ok: true, suggestions: ["Resposta A"] });
});

describe("POST /api/v1/conversations/:id/draft-reply", () => {
  it("exige agent+ antes de consultar conversa ou modelo", async () => {
    vi.mocked(requireRole).mockResolvedValue({ ok: false, response: fail("forbidden", "Acesso negado.", 403) } as never);
    const { POST } = await import("./route");

    expect((await POST(request(), context())).status).toBe(403);
    expect(requireRole).toHaveBeenCalledWith("agent", expect.objectContaining({ resource: "conversations" }));
    expect(createClient).not.toHaveBeenCalled();
    expect(generateDraftReply).not.toHaveBeenCalled();
  });

  it("consulta a conversa por id + organization_id e recusa id fora do tenant", async () => {
    mockConversation(false);
    const { POST } = await import("./route");

    const response = await POST(request(), context("44444444-4444-4444-8444-444444444444"));
    expect(response.status).toBe(404);
    expect(filters).toEqual({ id: "44444444-4444-4444-8444-444444444444", organization_id: ORG_ID });
    expect(generateDraftReply).not.toHaveBeenCalled();
  });

  it("entrega até três sugestões sem conteúdo do prompt ou token no corpo", async () => {
    vi.mocked(generateDraftReply).mockResolvedValue({ ok: true, suggestions: ["Resposta A", "Resposta B", "Resposta C"] });
    const { POST } = await import("./route");

    const response = await POST(request(), context());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ data: { suggestions: ["Resposta A", "Resposta B", "Resposta C"] } });
    expect(JSON.stringify(body)).not.toMatch(/prompt|token|secret/i);
  });

  it("ausência de agente e credencial recusada são silenciosas: 200 com lista vazia", async () => {
    const { POST } = await import("./route");
    vi.mocked(generateDraftReply).mockResolvedValueOnce({ ok: true, suggestions: [] });
    expect(await (await POST(request(), context())).json()).toEqual({ data: { suggestions: [] } });

    vi.mocked(generateDraftReply).mockRejectedValueOnce(new Error("Invalid API key: token-nao-expor"));
    const credentialResponse = await POST(request(), context());
    expect(credentialResponse.status).toBe(200);
    expect(await credentialResponse.json()).toEqual({ data: { suggestions: [] } });
  });

  it("LLM não configurado também não impede a resposta humana", async () => {
    const { POST } = await import("./route");
    vi.mocked(generateDraftReply).mockRejectedValueOnce(new LlmNotConfiguredError());

    const response = await POST(request(), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { suggestions: [] } });
  });
});
