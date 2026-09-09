// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { runCopilot } from "@/lib/ai/copilot/run";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/ai/copilot/run", () => ({ runCopilot: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/agent-engine/db/request-pool", () => ({ getRequestPool: vi.fn(() => ({})) }));
vi.mock("@/lib/agent-engine/edge/llm/credentials", async (original) => {
  const actual = await original<typeof import("@/lib/agent-engine/edge/llm/credentials")>();
  return { ...actual, llmEdgeConfigFromEnv: vi.fn(() => ({})) };
});
vi.mock("@/lib/env", () => ({ env: {} }));

const ORG = "22222222-2222-4222-8222-222222222222";
const USER = "11111111-1111-4111-8111-111111111111";

function authorize() {
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: {
      id: USER,
      email: "copilot@example.test",
      full_name: "Pessoa",
      avatar_url: null,
      is_platform_admin: false,
      idioma: "pt-BR",
      organizations: [{ organization_id: ORG, organization_name: "Org", role: "agent" }],
    },
    org: { orgId: ORG, name: "Org", role: "agent" },
  });
}

function request(body: unknown) {
  return new NextRequest("http://x/api/v1/ai/ask", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authorize();
  vi.mocked(checkRateLimit).mockResolvedValue({
    allowed: true,
    count: 1,
    limit: 20,
    window_sec: 60,
  });
  vi.mocked(runCopilot).mockResolvedValue({
    answer: "Há 3 oportunidades abertas.",
    sources: [{ kind: "lead", label: "Oportunidades", href: "/app/kanban" }],
    consulted_tools: ["crm_list_leads"],
  });
});

describe("POST /api/v1/ai/ask", () => {
  it("exige papel de agente, limita por organização+pessoa e responde pelo wrapper", async () => {
    const { POST } = await import("@/app/api/v1/ai/ask/route");
    const response = await POST(request({ question: "Quantas oportunidades?", history: [] }));

    expect(response.status).toBe(200);
    expect(requireRole).toHaveBeenCalledWith(
      "agent",
      expect.objectContaining({ resource: "copilot" }),
    );
    expect(checkRateLimit).toHaveBeenCalledWith(`copilot:${ORG}:${USER}`, 20, 60);
    expect(await response.json()).toEqual({
      data: {
        answer: "Há 3 oportunidades abertas.",
        sources: [{ kind: "lead", label: "Oportunidades", href: "/app/kanban" }],
        consulted_tools: ["crm_list_leads"],
      },
    });
  });

  it("recusa entrada inválida antes de chamar o modelo", async () => {
    const { POST } = await import("@/app/api/v1/ai/ask/route");
    const response = await POST(request({ question: "x".repeat(2_001), history: [] }));

    expect(response.status).toBe(422);
    expect(runCopilot).not.toHaveBeenCalled();
  });

  it("devolve 429 com Retry-After quando o limite foi atingido", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: false,
      count: 21,
      limit: 20,
      window_sec: 60,
    });
    const { POST } = await import("@/app/api/v1/ai/ask/route");
    const response = await POST(request({ question: "Resumo da operação", history: [] }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(runCopilot).not.toHaveBeenCalled();
  });

  it("traduz falha de credencial em orientação acionável", async () => {
    vi.mocked(runCopilot).mockRejectedValue(new Error("401 invalid api key"));
    const { POST } = await import("@/app/api/v1/ai/ask/route");
    const response = await POST(request({ question: "Resumo da operação", history: [] }));
    const body = (await response.json()) as { error: { code: string; message: string } };

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("ai_credential_error");
    expect(body.error.message).toMatch(/provedor de IA/i);
  });
});
