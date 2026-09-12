// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const USER = "11111111-1111-4111-8111-111111111111";

function authorize(role: "viewer" | "admin" = "admin") {
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: {
      id: USER,
      email: "dashboard@example.test",
      full_name: "Pessoa",
      avatar_url: null,
      is_platform_admin: false,
      idioma: "pt-BR",
      organizations: [{ organization_id: ORG, organization_name: "Org", role }],
    },
    org: { orgId: ORG, name: "Org", role },
  });
}

function database(row: unknown = null) {
  const filters: Array<[string, unknown]> = [];
  const upserts: unknown[] = [];
  const operations: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: any = {
    select: () => (operations.push("select"), query),
    eq: (column: string, value: unknown) => (filters.push([column, value]), query),
    maybeSingle: () => Promise.resolve({ data: row, error: null }),
    single: () => Promise.resolve({ data: row, error: null }),
    upsert: (value: unknown) => (operations.push("upsert"), upserts.push(value), query),
    delete: () => (operations.push("delete"), query),
  };
  vi.mocked(createClient).mockResolvedValue({ from: () => query } as never);
  return { filters, upserts, operations };
}

beforeEach(() => {
  vi.clearAllMocks();
  authorize();
});

describe("/api/v1/dashboard/preferences", () => {
  it("GET filtra simultaneamente pela organização e pela pessoa", async () => {
    const db = database(null);
    const { GET } = await import("@/app/api/v1/dashboard/preferences/route");
    const response = await GET(new NextRequest("http://x/api/v1/dashboard/preferences"));

    expect(response.status).toBe(200);
    expect(db.filters).toEqual([
      ["organization_id", ORG],
      ["user_id", USER],
    ]);
    const body = (await response.json()) as { data: { source: string; layout: { widgets: unknown[] } } };
    expect(body.data.source).toBe("default");
    expect(body.data.layout.widgets.length).toBeGreaterThan(0);
  });

  it("PUT higieniza o catálogo, salva na chave composta e audita sem conteúdo sensível", async () => {
    const db = database({ organization_id: ORG, user_id: USER });
    const { PUT } = await import("@/app/api/v1/dashboard/preferences/route");
    const response = await PUT(
      new NextRequest("http://x/api/v1/dashboard/preferences", {
        method: "PUT",
        body: JSON.stringify({
          schema_version: 1,
          widgets: [
            { id: "recent_conversations", visible: true, size: "wide" },
            { id: "recent_conversations", visible: false, size: "small" },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(db.operations).toContain("upsert");
    expect(db.upserts[0]).toMatchObject({ organization_id: ORG, user_id: USER, schema_version: 1 });
    expect(vi.mocked(audit)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "dashboard.preferences_updated",
        actorUserId: USER,
        organizationId: ORG,
        metadata: expect.objectContaining({ schema_version: 1 }),
      }),
    );
  });

  it("DELETE reseta somente a preferência da pessoa ativa", async () => {
    const db = database();
    const { DELETE } = await import("@/app/api/v1/dashboard/preferences/route");
    const response = await DELETE(new NextRequest("http://x/api/v1/dashboard/preferences", { method: "DELETE" }));

    expect(response.status).toBe(200);
    expect(db.operations).toContain("delete");
    expect(db.filters).toEqual([
      ["organization_id", ORG],
      ["user_id", USER],
    ]);
  });
});
