import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { generateFollowupDraft } from "@/lib/followup/ai-draft";
import type * as FollowupDraftModule from "@/lib/followup/ai-draft";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/agent-engine/db/request-pool", () => ({ getRequestPool: vi.fn(() => ({})) }));
vi.mock("@/lib/followup/ai-draft", async (importOriginal) => {
  const actual = await importOriginal<typeof FollowupDraftModule>();
  return { ...actual, generateFollowupDraft: vi.fn() };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const GRAPH = {
  nodes: [
    { id: "i", type: "trigger", label: "Início", position: { x: 0, y: 0 }, config: {} },
    { id: "f", type: "end", label: "Fim", position: { x: 0, y: 100 }, config: { outcome: "custom" } },
  ],
  edges: [{ id: "e", source: "i", target: "f", priority: 0, condition: { type: "always" } }],
};

function request(body: unknown) {
  return new NextRequest("http://localhost/api/v1/ai/followup-flows/generate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: "user-1", idioma: "pt-BR" },
    org: { orgId: "org-1", role: "manager", name: "Org" },
  } as never);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, count: 1, limit: 8, window_sec: 60 });
  vi.mocked(getRequestPool).mockReturnValue({} as never);
  vi.mocked(generateFollowupDraft).mockResolvedValue(GRAPH as never);
  vi.mocked(createClient).mockResolvedValue({
    from: () => ({
      insert: (payload: Record<string, unknown>) => ({
        select: () => ({
          single: async () => ({
            data: { id: "flow-1", status: "draft", ...payload },
            error: null,
          }),
        }),
      }),
    }),
  } as never);
});

describe("POST /api/v1/ai/followup-flows/generate", () => {
  it("gera, valida e grava como rascunho sem registrar o prompt na auditoria", async () => {
    const { POST } = await import("@/app/api/v1/ai/followup-flows/generate/route");
    const res = await POST(request({
      name: "Retomada",
      description: "Espere trinta minutos, envie uma mensagem e encerre.",
    }));

    expect(res.status).toBe(201);
    expect(generateFollowupDraft).toHaveBeenCalledWith(
      { organizationId: "org-1", description: "Espere trinta minutos, envie uma mensagem e encerre." },
      expect.any(Object),
    );
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "followup_flow.created",
      metadata: { name: "Retomada", generated_with_ai: true, node_count: 2 },
    }));
    expect(JSON.stringify(vi.mocked(audit).mock.calls)).not.toContain("Espere trinta minutos");
  });

  it("recusa descrição curta antes de chamar o modelo", async () => {
    const { POST } = await import("@/app/api/v1/ai/followup-flows/generate/route");
    const res = await POST(request({ name: "Curto", description: "mande oi" }));
    expect(res.status).toBe(422);
    expect(generateFollowupDraft).not.toHaveBeenCalled();
  });

  it("não expõe detalhes internos quando a gravação do rascunho falha", async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: null,
              error: {
                code: "XX000",
                message: "connection failed with password segredo-super-secreto",
              },
            }),
          }),
        }),
      }),
    } as never);

    const { POST } = await import("@/app/api/v1/ai/followup-flows/generate/route");
    const res = await POST(request({
      name: "Retomada segura",
      description: "Espere trinta minutos, envie uma mensagem e encerre.",
    }));
    const body = await res.text();

    expect(res.status).toBe(500);
    expect(body).not.toContain("segredo-super-secreto");
    expect(body).not.toContain("connection failed");
    expect(body).toContain("Erro inesperado");
  });
});
