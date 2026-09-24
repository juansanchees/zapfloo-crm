import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/requirePlatformAdmin", () => ({ requirePlatformAdmin: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";

type StubOptions = {
  enabled?: boolean;
  settingMissing?: boolean;
  organizations?: Array<{ id: string; created_at: string }>;
  subscriptions?: Array<Record<string, unknown>>;
  pendingCount?: number;
  organizationsFailFrom?: number;
};

function queryResult<T>(data: T[], count: number | null = data.length, failFrom?: number) {
  let from = 0;
  let to = Number.POSITIVE_INFINITY;
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    range: (nextFrom: number, nextTo: number) => {
      from = nextFrom;
      to = nextTo;
      return builder;
    },
    maybeSingle: async () => ({ data, error: null, count }),
    single: async () => ({ data, error: null, count }),
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve(from === failFrom
        ? { data: null, error: { message: "page_failed" }, count }
        : { data: data.slice(from, to + 1), error: null, count }).then(resolve);
    },
  };
  return builder;
}

function adminStub(options: StubOptions = {}) {
  const updates: Array<Record<string, unknown>> = [];
  const setting = {
    singleton: true,
    enforcement_enabled: options.enabled ?? false,
    updated_at: "2026-09-24T12:00:00.000Z",
    updated_by: null,
  };
  const settingQuery = {
    select: () => settingQuery,
    eq: () => settingQuery,
    maybeSingle: async () => ({ data: options.settingMissing ? null : setting, error: null }),
    update: (payload: Record<string, unknown>) => {
      updates.push(payload);
      Object.assign(setting, payload);
      return settingQuery;
    },
    single: async () => ({ data: setting, error: null }),
  };
  return {
    updates,
    client: {
      from(table: string) {
        if (table === "platform_billing_settings") return settingQuery;
        if (table === "organizations") {
          const rows = options.organizations ?? [];
          return queryResult(rows, rows.length, options.organizationsFailFrom);
        }
        if (table === "organization_subscriptions") return queryResult(options.subscriptions ?? []);
        if (table === "billing_provider_events") return queryResult([], options.pendingCount ?? 0);
        throw new Error(`unexpected table ${table}`);
      },
    },
  };
}

function patchRequest(enabled: boolean, confirmation: string) {
  return new NextRequest("http://localhost/api/v1/admin/billing/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enforcement_enabled: enabled, confirmation }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requirePlatformAdmin).mockResolvedValue({
    user: { id: ADMIN_ID },
    platformAdmin: { user_id: ADMIN_ID, scope: "full", mfa_required: false },
  } as never);
});

describe("/api/v1/admin/billing/settings", () => {
  it("nega anon/tenant sem abrir service role", async () => {
    vi.mocked(requirePlatformAdmin).mockRejectedValueOnce(new Error("forbidden"));
    const { GET } = await import("./route");
    const response = await GET();
    expect(response.status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("nasce desligado e calcula o impacto antes de ligar sem alterar assinaturas", async () => {
    const { client, updates } = adminStub({
      organizations: [
        { id: "10000000-0000-4000-8000-000000000001", created_at: "2026-09-01T00:00:00.000Z" },
        { id: "10000000-0000-4000-8000-000000000002", created_at: "2026-01-01T00:00:00.000Z" },
        { id: "10000000-0000-4000-8000-000000000003", created_at: "2026-01-01T00:00:00.000Z" },
      ],
      subscriptions: [
        { organization_id: "10000000-0000-4000-8000-000000000001", status: "teste", paid_through: null },
        { organization_id: "10000000-0000-4000-8000-000000000002", status: "ativo", paid_through: null },
        { organization_id: "10000000-0000-4000-8000-000000000003", status: "pausado", paid_through: null },
      ],
      pendingCount: 2,
    });
    vi.mocked(createAdminClient).mockReturnValue(client as never);
    const { GET } = await import("./route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        enforcement_enabled: false,
        can_mutate: true,
        review: {
          total_organizations: 3,
          expired_count: 1,
          legacy_count: 1,
          paused_count: 1,
          pending_count: 2,
        },
      },
    });
    expect(updates).toEqual([]);
  });

  it("degrada para desligado quando a configuração ainda não existe", async () => {
    const { client } = adminStub({ settingMissing: true });
    vi.mocked(createAdminClient).mockReturnValue(client as never);
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(body.data.enforcement_enabled).toBe(false);
  });

  it("percorre todas as páginas antes de calcular o impacto global", async () => {
    const organizations = Array.from({ length: 1_001 }, (_, index) => ({
      id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      created_at: "2026-01-01T00:00:00.000Z",
    }));
    const subscriptions = organizations.map((organization) => ({
      organization_id: organization.id,
      status: "pausado",
      paid_through: null,
    }));
    const { client } = adminStub({ organizations, subscriptions });
    vi.mocked(createAdminClient).mockReturnValue(client as never);
    const { GET } = await import("./route");
    const body = await (await GET()).json();

    expect(body.data.review).toMatchObject({
      total_organizations: 1_001,
      paused_count: 1_001,
    });
  });

  it("falha fechado quando uma página global não pode ser lida", async () => {
    const organizations = Array.from({ length: 1_001 }, (_, index) => ({
      id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      created_at: "2026-01-01T00:00:00.000Z",
    }));
    const { client } = adminStub({ organizations, organizationsFailFrom: 1_000 });
    vi.mocked(createAdminClient).mockReturnValue(client as never);
    const { GET } = await import("./route");

    expect((await GET()).status).toBe(500);
  });

  it("usa resultado discriminado em vez de instanceof entre realms", () => {
    const source = readFileSync("app/api/v1/admin/billing/settings/route.ts", "utf8");
    expect(source).not.toContain("instanceof Response");
    expect(source).toContain("if (!authorization.ok) return authorization.response");
  });

  it("support_readonly pode revisar, mas nunca mudar o interruptor", async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValue({
      user: { id: ADMIN_ID },
      platformAdmin: { user_id: ADMIN_ID, scope: "support_readonly", mfa_required: false },
    } as never);
    const { client, updates } = adminStub();
    vi.mocked(createAdminClient).mockReturnValue(client as never);
    const { GET, PATCH } = await import("./route");
    expect((await GET()).status).toBe(200);
    const read = await (await GET()).json();
    expect(read.data.can_mutate).toBe(false);
    const response = await PATCH(patchRequest(true, "ATIVAR BLOQUEIO COMERCIAL"));
    expect(response.status).toBe(403);
    expect(updates).toEqual([]);
  });

  it("exige confirmação explícita e audita before/after com ator", async () => {
    const { client, updates } = adminStub({ enabled: false });
    vi.mocked(createAdminClient).mockReturnValue(client as never);
    const { PATCH } = await import("./route");

    const semConfirmacao = await PATCH(patchRequest(true, "sim"));
    expect(semConfirmacao.status).toBe(400);
    expect(updates).toEqual([]);

    const response = await PATCH(patchRequest(true, "ATIVAR BLOQUEIO COMERCIAL"));
    expect(response.status).toBe(200);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ enforcement_enabled: true, updated_by: ADMIN_ID });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "platform_admin.billing_enforcement_changed",
      actorUserId: ADMIN_ID,
      actingAsPlatformAdmin: true,
      metadata: { before: { enforcement_enabled: false }, after: { enforcement_enabled: true } },
    }));
  });

  it("não confirma sucesso antes de a tentativa de auditoria terminar", async () => {
    const { client } = adminStub({ enabled: false });
    vi.mocked(createAdminClient).mockReturnValue(client as never);
    let releaseAudit: (() => void) | undefined;
    vi.mocked(audit).mockImplementationOnce(() => new Promise<void>((resolve) => { releaseAudit = resolve; }));
    const { PATCH } = await import("./route");
    let resolved = false;
    const pending = PATCH(patchRequest(true, "ATIVAR BLOQUEIO COMERCIAL")).then((response) => {
      resolved = true;
      return response;
    });
    await vi.waitFor(() => expect(audit).toHaveBeenCalledTimes(1));
    expect(resolved).toBe(false);
    releaseAudit?.();
    expect((await pending).status).toBe(200);
  });
});
