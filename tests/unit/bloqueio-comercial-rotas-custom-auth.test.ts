// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  commercial: vi.fn(),
  loadUser: vi.fn(),
  resolveOrg: vi.fn(),
  mfa: vi.fn(),
  findSession: vi.fn(),
  createTemplate: vi.fn(),
  listTemplates: vi.fn(),
  upsert: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  rpc: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/billing/acesso-server", () => ({
  recusaComercialDaMutacao: mocks.commercial,
}));
vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: mocks.loadUser,
  resolveActiveOrg: mocks.resolveOrg,
  mfaEmDivida: mocks.mfa,
}));
vi.mock("@/lib/channels/connect", () => ({ findPartnerSession: mocks.findSession }));
vi.mock("@/lib/channels", () => ({
  CHANNEL_SESSION_REF_COLUMNS: "provider, provider_session_ref",
  DEFAULT_CHANNEL_PROVIDER: "parceiro",
  resolveSessionRef: () => "conta-remota",
  getAdapter: () => ({ templates: { create: mocks.createTemplate, list: mocks.listTemplates } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: { id: "sessao", provider: "parceiro" }, error: null }),
      upsert: mocks.upsert,
    };
    return {
      from: () => chain,
      rpc: mocks.rpc,
      storage: {
        from: () => ({ upload: mocks.upload, remove: mocks.remove, createSignedUrl: vi.fn() }),
      },
    };
  },
}));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: mocks.rateLimit }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

function respostaBloqueada(): Response {
  return Response.json({
    error: {
      code: "commercial_access_blocked",
      message: "Assinatura bloqueada.",
      details: { reason: "paused", access_until: null, enforcement_enabled: false },
    },
  }, { status: 402 });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadUser.mockResolvedValue({
    id: USER,
    idioma: "pt-BR",
    is_platform_admin: false,
  });
  mocks.resolveOrg.mockResolvedValue({ orgId: ORG, name: "Org", role: "admin" });
  mocks.mfa.mockResolvedValue(false);
  mocks.findSession.mockResolvedValue({ id: "sessao", archivedAt: null });
  mocks.commercial.mockResolvedValue(respostaBloqueada());
  mocks.rateLimit.mockResolvedValue({ allowed: true });
});

async function conferir402(resposta: Response): Promise<void> {
  expect(resposta.status).toBe(402);
  expect(await resposta.json()).toEqual({
    error: {
      code: "commercial_access_blocked",
      message: "Assinatura bloqueada.",
      details: { reason: "paused", access_until: null, enforcement_enabled: false },
    },
  });
}

describe("rotas tenant com autenticação própria", () => {
  it("template bloqueado não chama adapter remoto nem faz upsert", async () => {
    const { POST } = await import("@/app/api/v1/channels/partner/templates/route");
    const resposta = await POST(new NextRequest("https://crm.invalid/api/v1/channels/partner/templates", {
      method: "POST",
      body: JSON.stringify({ acao: "criar", name: "x", language: "pt_BR", components: [] }),
      headers: { "content-type": "application/json" },
    }));

    await conferir402(resposta);
    expect(mocks.createTemplate).not.toHaveBeenCalled();
    expect(mocks.listTemplates).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("mídia de template bloqueada não lê bytes nem toca o Storage", async () => {
    const { POST } = await import("@/app/api/v1/channels/partner/templates/media/route");
    const arrayBuffer = vi.fn();
    const req = new NextRequest("https://crm.invalid/api/v1/channels/partner/templates/media", {
      method: "POST",
      body: new FormData(),
    });
    vi.spyOn(req, "formData").mockResolvedValue({ get: () => ({ arrayBuffer }) } as never);

    await conferir402(await POST(req));
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it.each(["POST", "DELETE"] as const)("logo tenant %s bloqueado não toca rate limit, Storage ou banco", async (method) => {
    const rota = await import("@/app/api/v1/marca/logo/route");
    const url = `https://crm.invalid/api/v1/marca/logo${method === "DELETE" ? "?escopo=organizacao" : ""}`;
    const init: ConstructorParameters<typeof NextRequest>[1] = { method };
    if (method === "POST") {
      const form = new FormData();
      form.set("escopo", "organizacao");
      init.body = form;
    }
    const resposta = await rota[method](new NextRequest(url, init));

    await conferir402(resposta);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
