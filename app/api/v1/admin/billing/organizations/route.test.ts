import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/auth/requirePlatformAdmin", () => ({ requirePlatformAdmin: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";

function builder(data: unknown[]) {
  const calls: Array<[string, ...unknown[]]> = [];
  const q = {
    select: (...args: unknown[]) => { calls.push(["select", ...args]); return q; },
    order: (...args: unknown[]) => { calls.push(["order", ...args]); return q; },
    limit: (...args: unknown[]) => { calls.push(["limit", ...args]); return q; },
    in: (...args: unknown[]) => { calls.push(["in", ...args]); return q; },
    or: (...args: unknown[]) => { calls.push(["or", ...args]); return q; },
    eq: (...args: unknown[]) => { calls.push(["eq", ...args]); return q; },
    maybeSingle: async () => ({ data: data[0] ?? null, error: null }),
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve({ data, error: null }).then(resolve);
    },
  };
  return { q, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("INTERNAL_SECRET", "segredo-ficticio-de-cursor-com-32-bytes");
  vi.mocked(requirePlatformAdmin).mockResolvedValue({
    user: { id: ADMIN_ID },
    platformAdmin: { user_id: ADMIN_ID, scope: "support_readonly", mfa_required: false },
  } as never);
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/v1/admin/billing/organizations", () => {
  it("nega quem não é admin da plataforma", async () => {
    vi.mocked(requirePlatformAdmin).mockRejectedValueOnce(new Error("forbidden"));
    const { GET } = await import("./route");
    const response = await GET(new NextRequest("http://localhost/api/v1/admin/billing/organizations"));
    expect(response.status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("pagina sem omitir organizações e expõe datas legadas para revisão", async () => {
    const orgs = builder([
      { id: "10000000-0000-4000-8000-000000000003", display_name: "Clínica C", created_at: "2026-03-01T00:00:00.000Z" },
      { id: "10000000-0000-4000-8000-000000000002", display_name: "Clínica B", created_at: "2026-02-01T00:00:00.000Z" },
      { id: "10000000-0000-4000-8000-000000000001", display_name: "Clínica A", created_at: "2026-01-01T00:00:00.000Z" },
    ]);
    const subscriptions = builder([
      {
        organization_id: "10000000-0000-4000-8000-000000000003",
        plan_id: "completo",
        status: "ativo",
        billing_provider: "monetizze",
        last_payment_at: "2026-09-01T12:00:00.000Z",
        paid_through: "2026-10-01T12:00:00.000Z",
        access_until: "2026-10-04T12:00:00.000Z",
        updated_at: "2026-09-01T12:00:00.000Z",
      },
      {
        organization_id: "10000000-0000-4000-8000-000000000002",
        plan_id: "basico",
        status: "ativo",
        billing_provider: null,
        last_payment_at: null,
        paid_through: null,
        access_until: null,
        updated_at: "2026-02-01T00:00:00.000Z",
      },
    ]);
    const settings = builder([{ enforcement_enabled: false }]);
    vi.mocked(createAdminClient).mockReturnValue({
      from(table: string) {
        if (table === "organizations") return orgs.q;
        if (table === "organization_subscriptions") return subscriptions.q;
        if (table === "platform_billing_settings") return settings.q;
        throw new Error(`unexpected table ${table}`);
      },
    } as never);

    const { GET } = await import("./route");
    const response = await GET(new NextRequest("http://localhost/api/v1/admin/billing/organizations?limit=2"));
    expect(response.status).toBe(200);
    const body = await response.json() as { data: Array<Record<string, unknown>>; meta: Record<string, unknown> };
    expect(body.data).toHaveLength(2);
    expect(body.meta).toMatchObject({ has_more: true });
    expect(body.meta.cursor).toEqual(expect.any(String));
    expect(body.data[0]).toMatchObject({
      organization_name: "Clínica C",
      plan_id: "completo",
      status: "ativo",
      paid_through: "2026-10-01T12:00:00.000Z",
      access_until: "2026-10-04T12:00:00.000Z",
      review_required: false,
    });
    expect(body.data[1]).toMatchObject({
      organization_name: "Clínica B",
      plan_id: "basico",
      status: "ativo",
      last_payment_at: null,
      paid_through: null,
      access_until: null,
      review_required: true,
      access_reason: "legacy_unreviewed",
    });
    expect(subscriptions.calls).toContainEqual([
      "in",
      "organization_id",
      ["10000000-0000-4000-8000-000000000003", "10000000-0000-4000-8000-000000000002"],
    ]);
  });

  it("recusa cursor inválido antes de consultar", async () => {
    const { GET } = await import("./route");
    const response = await GET(new NextRequest("http://localhost/api/v1/admin/billing/organizations?cursor=invalido"));
    expect(response.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("recusa cursor assinado adulterado antes de abrir service role", async () => {
    const orgs = builder([
      { id: "10000000-0000-4000-8000-000000000002", display_name: "B", created_at: "2026-02-01T00:00:00.000Z" },
      { id: "10000000-0000-4000-8000-000000000001", display_name: "A", created_at: "2026-01-01T00:00:00.000Z" },
    ]);
    const subscriptions = builder([]);
    const settings = builder([{ enforcement_enabled: false }]);
    vi.mocked(createAdminClient).mockReturnValue({
      from(table: string) {
        if (table === "organizations") return orgs.q;
        if (table === "organization_subscriptions") return subscriptions.q;
        if (table === "platform_billing_settings") return settings.q;
        throw new Error(`unexpected table ${table}`);
      },
    } as never);
    const { GET } = await import("./route");
    const first = await GET(new NextRequest("http://localhost/api/v1/admin/billing/organizations?limit=1"));
    const firstBody = await first.json() as { meta: { cursor: string } };
    const [payload, signature] = firstBody.meta.cursor.split(".");
    const tampered = `${payload}.${signature?.startsWith("A") ? "B" : "A"}${signature?.slice(1)}`;
    vi.mocked(createAdminClient).mockClear();
    const response = await GET(new NextRequest(
      `http://localhost/api/v1/admin/billing/organizations?limit=1&cursor=${encodeURIComponent(tampered)}`,
    ));
    expect(response.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
