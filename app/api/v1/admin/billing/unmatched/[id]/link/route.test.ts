import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/auth/requirePlatformAdmin", () => ({ requirePlatformAdmin: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";
const ORG_ID = "33333333-3333-4333-8333-333333333333";

function request(body: unknown) {
  return new NextRequest(`http://localhost/api/v1/admin/billing/unmatched/${EVENT_ID}/link`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function adminStub(rpcResult: Record<string, unknown> = { status: "linked", event_id: EVENT_ID }) {
  const filters: Array<[string, unknown]> = [];
  const organizationQuery = {
    select: () => organizationQuery,
    eq: (column: string, value: unknown) => { filters.push([column, value]); return organizationQuery; },
    maybeSingle: async () => ({ data: { id: ORG_ID }, error: null }),
  };
  const rpc = vi.fn(async () => ({ data: rpcResult, error: null }));
  return {
    stub: {
      from: (table: string) => {
        if (table !== "organizations") throw new Error(`unexpected table ${table}`);
        return organizationQuery;
      },
      rpc,
    },
    rpc,
    filters,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requirePlatformAdmin).mockResolvedValue({
    user: { id: ADMIN_ID },
    platformAdmin: { user_id: ADMIN_ID, scope: "full", mfa_required: false },
  } as never);
});

describe("POST /api/v1/admin/billing/unmatched/[id]/link", () => {
  it("é exclusivo de admin da plataforma", async () => {
    vi.mocked(requirePlatformAdmin).mockRejectedValueOnce(new Error("forbidden"));
    const { POST } = await import("./route");
    const response = await POST(request({ organization_id: ORG_ID, reason: "Conciliação confirmada" }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(response.status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("scope support_readonly não pode conciliar cobrança nem abrir client service-role", async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValueOnce({
      user: { id: ADMIN_ID },
      platformAdmin: { user_id: ADMIN_ID, scope: "support_readonly", mfa_required: false },
    } as never);
    const { POST } = await import("./route");
    const response = await POST(request({ organization_id: ORG_ID, reason: "Conciliação confirmada" }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(response.status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("valida a organização e usa somente a RPC atômica para vincular e projetar", async () => {
    const { stub, rpc, filters } = adminStub();
    vi.mocked(createAdminClient).mockReturnValue(stub as never);
    const { POST } = await import("./route");
    const response = await POST(request({ organization_id: ORG_ID, reason: "Compra conferida no painel" }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(response.status).toBe(200);
    expect(filters).toContainEqual(["id", ORG_ID]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("fn_vincular_evento_monetizze", {
      p_event_id: EVENT_ID,
      p_organization_id: ORG_ID,
      p_actor_user_id: ADMIN_ID,
      p_reason: "Compra conferida no painel",
    });
  });

  it.each(["already_linked", "not_pending"])("segunda tentativa %s conflita sem reprojetar", async (status) => {
    const { stub, rpc } = adminStub({ status, event_id: EVENT_ID });
    vi.mocked(createAdminClient).mockReturnValue(stub as never);
    const { POST } = await import("./route");
    const response = await POST(request({ organization_id: ORG_ID, reason: "Duplo clique" }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(response.status).toBe(409);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("recusa ids e motivo inválidos antes de consultar", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ organization_id: "não-é-uuid", reason: "x" }), {
      params: Promise.resolve({ id: EVENT_ID }),
    });
    expect(response.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
