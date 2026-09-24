import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";

vi.mock("@/lib/auth/requirePlatformAdmin", () => ({ requirePlatformAdmin: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";

function ledgerBuilder(rows: Array<Record<string, unknown>>) {
  const calls: Array<[string, ...unknown[]]> = [];
  const builder = {
    select: (...args: unknown[]) => { calls.push(["select", ...args]); return builder; },
    eq: (...args: unknown[]) => { calls.push(["eq", ...args]); return builder; },
    order: (...args: unknown[]) => { calls.push(["order", ...args]); return builder; },
    limit: (...args: unknown[]) => { calls.push(["limit", ...args]); return builder; },
    or: (...args: unknown[]) => { calls.push(["or", ...args]); return builder; },
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve({ data: rows, error: null }).then(resolve);
    },
  };
  return { builder, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("INTERNAL_SECRET", "segredo-ficticio-de-cursor-com-32-bytes");
  vi.mocked(requirePlatformAdmin).mockResolvedValue({
    user: { id: ADMIN_ID },
    platformAdmin: { user_id: ADMIN_ID, scope: "full", mfa_required: false },
  } as never);
});

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/v1/admin/billing/unmatched", () => {
  it("é exclusivo de admin da plataforma", async () => {
    vi.mocked(requirePlatformAdmin).mockRejectedValueOnce(new Error("forbidden"));
    const { GET } = await import("./route");
    const response = await GET(new NextRequest("http://localhost/api/v1/admin/billing/unmatched"));
    expect(response.status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("lista somente pendências paginadas e nunca devolve hash de e-mail", async () => {
    const rows = [
      {
        id: "22222222-2222-4222-8222-222222222221",
        provider: "monetizze",
        event_kind: "subscription",
        event_at: "2026-09-24T12:00:00.000Z",
        product_code: "produto-normalizado",
        plan_id: "completo",
        target_status: "ativo",
        buyer_email_masked: "a***@example.test",
        received_at: "2026-09-24T12:01:00.000Z",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        provider: "monetizze",
        event_kind: "subscription",
        event_at: "2026-09-24T11:00:00.000Z",
        product_code: "produto-normalizado",
        plan_id: "basico",
        target_status: "ativo",
        buyer_email_masked: null,
        received_at: "2026-09-24T11:01:00.000Z",
      },
    ];
    const { builder, calls } = ledgerBuilder(rows);
    vi.mocked(createAdminClient).mockReturnValue({ from: () => builder } as never);

    const { GET } = await import("./route");
    const response = await GET(new NextRequest("http://localhost/api/v1/admin/billing/unmatched?limit=1"));
    expect(response.status).toBe(200);
    const body = await response.json() as {
      data: Array<Record<string, unknown>>;
      meta: { has_more: boolean; cursor: string | null };
    };
    expect(body.data).toHaveLength(1);
    expect(body.meta.has_more).toBe(true);
    expect(body.meta.cursor).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toContain("buyer_email_hash");
    expect(calls).toContainEqual(["eq", "outcome", "pending_match"]);
    expect(calls).toContainEqual(["limit", 2]);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "platform_admin.billing_unmatched_listed",
      actorUserId: ADMIN_ID,
      actingAsPlatformAdmin: true,
    }));
  });

  it("recusa cursor adulterado antes de consultar", async () => {
    const rows = [
      {
        id: "22222222-2222-4222-8222-222222222221",
        provider: "monetizze",
        event_kind: "subscription",
        event_at: "2026-09-24T12:00:00.000Z",
        product_code: "produto-normalizado",
        plan_id: "completo",
        target_status: "ativo",
        buyer_email_masked: "a***@example.test",
        received_at: "2026-09-24T12:01:00.000Z",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        provider: "monetizze",
        event_kind: "subscription",
        event_at: "2026-09-24T11:00:00.000Z",
        product_code: "produto-normalizado",
        plan_id: "basico",
        target_status: "ativo",
        buyer_email_masked: null,
        received_at: "2026-09-24T11:01:00.000Z",
      },
    ];
    const { builder } = ledgerBuilder(rows);
    vi.mocked(createAdminClient).mockReturnValue({ from: () => builder } as never);
    const { GET } = await import("./route");
    const first = await GET(new NextRequest("http://localhost/api/v1/admin/billing/unmatched?limit=1"));
    const firstBody = await first.json() as { meta: { cursor: string } };
    const cursor = firstBody.meta.cursor;
    const [encoded, signature] = cursor.split(".");
    const decoded = JSON.parse(Buffer.from(encoded!, "base64url").toString("utf8")) as {
      received_at: string;
      id: string;
    };
    decoded.id = "99999999-9999-4999-8999-999999999999";
    const changedPayload = Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url");
    const tampered = signature ? `${changedPayload}.${signature}` : changedPayload;
    vi.mocked(createAdminClient).mockClear();

    const response = await GET(new NextRequest(
      `http://localhost/api/v1/admin/billing/unmatched?cursor=${encodeURIComponent(tampered)}`,
    ));
    expect(response.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
