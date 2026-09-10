// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

import LeadsPage from "./page";

const state = vi.hoisted(() => ({
  activeOrg: { orgId: "org-ativa", role: "viewer" } as { orgId: string; role: string } | null,
  response: [{ id: "funil-padrao" }] as Array<{ id: string }>,
  failure: false,
  requests: [] as URL[],
}));

vi.mock("@/lib/auth/server", () => ({
  requireAuth: async () => ({ id: "usuario-1" }),
  resolveActiveOrg: async () => state.activeOrg,
}));

// O client real constrói a requisição; só o transporte ao banco é substituído.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => createClient("http://127.0.0.1:54321", "anon-fixture", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input: RequestInfo | URL) => {
        state.requests.push(new URL(String(input)));
        return new Response(JSON.stringify(state.failure ? { message: "database unavailable" } : state.response), {
          status: state.failure ? 400 : 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  }),
}));

// O redirect real do Next lança com o destino no digest, como em produção.
beforeEach(() => {
  state.activeOrg = { orgId: "org-ativa", role: "viewer" };
  state.response = [{ id: "funil-padrao" }];
  state.failure = false;
  state.requests = [];
});

describe("entrada operacional de Leads", () => {
  it("abre o quadro para viewer e solicita somente funil ativo da organização confiável", async () => {
    await expect(LeadsPage()).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/app/pipelines/funil-padrao;307;",
    });
    expect(state.requests).toHaveLength(1);
    const request = state.requests[0]!;
    expect(request.pathname).toBe("/rest/v1/crm_pipelines");
    expect(request.searchParams.get("organization_id")).toBe("eq.org-ativa");
    expect(request.searchParams.get("is_archived")).toBe("eq.false");
    expect(request.searchParams.get("order")).toBe("is_default.desc,position.asc,id.asc");
    expect(request.searchParams.get("limit")).toBe("1");
  });

  it("sem funil usa a página com ação de criar, sem redirecionar para si mesma", async () => {
    state.response = [];
    await expect(LeadsPage()).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/app/kanban;307;",
    });
  });

  it("sem organização ativa não consulta funis de outras organizações", async () => {
    state.activeOrg = null;
    await expect(LeadsPage()).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/app;307;",
    });
    expect(state.requests).toHaveLength(0);
  });

  it("falha do banco alcança a tela de erro, sem fingir ausência de funil", async () => {
    state.failure = true;
    await expect(LeadsPage()).rejects.toThrow("Falha ao carregar funil para operação de leads.");
  });
});
