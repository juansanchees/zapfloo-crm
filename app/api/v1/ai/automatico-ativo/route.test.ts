import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { GET } from "./route";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const org = "11111111-1111-4111-8111-111111111111";
const canal = "22222222-2222-4222-8222-222222222222";
let agents: unknown[];
let channels: unknown[];
let balanceIncident: unknown;

function query(table: string) {
  const result = () => ({
    data: table === "ai_agents" ? agents
      : table === "channel_sessions" ? channels
      : table === "incidents" ? balanceIncident
      : null,
    error: null,
  });
  const q = {
    select: () => q, eq: () => q, neq: () => q, is: () => q, order: () => q, limit: () => q,
    maybeSingle: async () => result(),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
  };
  return q;
}

beforeEach(() => {
  agents = [{ kind: "mcp_agent", is_active: true, published_version_id: "33333333-3333-4333-8333-333333333333", archived_at: null }];
  channels = [{ id: canal, status: "WORKING", archived_at: null, metadata: { ai_gate: "allowlist", ai_gate_mode: "pre_go_live", ai_test_phone_numbers: [] } }];
  balanceIncident = null;
  vi.mocked(requireRole).mockResolvedValue({ ok: true, user: { id: org }, org: { orgId: org, role: "agent" } } as Awaited<ReturnType<typeof requireRole>>);
  vi.mocked(createAdminClient).mockReturnValue({ from: query } as unknown as ReturnType<typeof createAdminClient>);
});

describe("estado visível do atendimento por IA", () => {
  it("canal em allowlist sem ninguém autorizado declara o silêncio, não atendimento", async () => {
    const response = await GET(new NextRequest("http://localhost/api/v1/ai/automatico-ativo"));
    expect((await response.json()).data).toEqual({ ativo: true, estado: "em_teste", motivo: null, numeros_autorizados: 0, canal_id: canal });
  });

  it("canal aberto declara atendimento para todos", async () => {
    channels = [{ id: canal, status: "WORKING", archived_at: null, metadata: { ai_gate: "open" } }];
    const response = await GET(new NextRequest("http://localhost/api/v1/ai/automatico-ativo"));
    expect((await response.json()).data).toMatchObject({ ativo: true, estado: "atendendo_todos" });
  });

  it("saldo global esgotado torna a indisponibilidade explícita para o cliente", async () => {
    balanceIncident = { id: "44444444-4444-4444-8444-444444444444" };
    const response = await GET(new NextRequest("http://localhost/api/v1/ai/automatico-ativo"));
    expect((await response.json()).data).toMatchObject({ ativo: false, estado: "desligada", motivo: "saldo_da_plataforma" });
  });

  it("sem agente publicado não afirma que alguém está respondendo", async () => {
    agents = [];
    const response = await GET(new NextRequest("http://localhost/api/v1/ai/automatico-ativo"));
    expect((await response.json()).data).toMatchObject({ ativo: false, estado: "desligada", motivo: "nenhum_agente_publicado" });
  });
});
