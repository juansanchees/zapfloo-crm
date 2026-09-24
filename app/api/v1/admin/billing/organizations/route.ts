import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { decidirAcessoComercial } from "@/lib/billing/acesso-comercial";
import type { SituacaoComercialDaAssinatura } from "@/lib/billing/planos";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().max(2048).optional(),
});
const cursorSchema = z.object({
  created_at: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
}).strict();
type Cursor = z.infer<typeof cursorSchema>;

const CURSOR_CONTEXT = "zapfloo:admin:billing-organizations-cursor:v1";

function signCursorPayload(encoded: string): Buffer | null {
  const secret = env.INTERNAL_SECRET.trim();
  if (secret.length < 16) return null;
  const key = createHmac("sha256", secret)
    .update(`derive\0${CURSOR_CONTEXT}`, "utf8")
    .digest();
  return createHmac("sha256", key)
    .update(`${CURSOR_CONTEXT}\0${encoded}`, "utf8")
    .digest();
}

function encodeCursor(cursor: Cursor): string | null {
  const encoded = Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
  const signature = signCursorPayload(encoded);
  return signature ? `${encoded}.${signature.toString("base64url")}` : null;
}
function decodeCursor(encoded: string): Cursor | null {
  const parts = encoded.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payload, signatureText] = parts;
  const expected = signCursorPayload(payload);
  if (!expected) return null;
  try {
    const received = Buffer.from(signatureText, "base64url");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const requestId = randomUUID();
  try {
    await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Platform admin required", 403, { requestId });
  }

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return fail("validation_error", "Invalid query params", 400, { requestId });
  }
  const cursor = parsed.data.cursor ? decodeCursor(parsed.data.cursor) : null;
  if (parsed.data.cursor && !cursor) {
    return fail("validation_error", "Invalid cursor", 400, { requestId });
  }

  const admin = createAdminClient();
  let organizationsQuery = admin
    .from("organizations")
    .select("id,display_name,created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(parsed.data.limit + 1);
  if (cursor) {
    organizationsQuery = organizationsQuery.or(
      `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
    );
  }
  const { data: organizations, error: organizationsError } = await organizationsQuery;
  if (organizationsError) {
    return fail("internal_error", "Failed to load organizations", 500, { requestId });
  }

  const allRows = organizations ?? [];
  const hasMore = allRows.length > parsed.data.limit;
  const page = hasMore ? allRows.slice(0, parsed.data.limit) : allRows;
  const ids = page.map((row) => row.id);
  const [{ data: subscriptions, error: subscriptionsError }, { data: setting, error: settingError }] = await Promise.all([
    ids.length
      ? admin
          .from("organization_subscriptions")
          .select("organization_id,plan_id,status,billing_provider,last_payment_at,paid_through,access_until,updated_at")
          .in("organization_id", ids)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("platform_billing_settings")
      .select("enforcement_enabled")
      .eq("singleton", true)
      .maybeSingle(),
  ]);
  if (subscriptionsError ?? settingError) {
    return fail("internal_error", "Failed to load billing review", 500, { requestId });
  }

  const byOrganization = new Map((subscriptions ?? []).map((row) => [row.organization_id, row]));
  const now = new Date();
  const rows = page.map((organization) => {
    const subscription = byOrganization.get(organization.id);
    const status = (subscription?.status ?? "ativo") as SituacaoComercialDaAssinatura;
    const decision = decidirAcessoComercial({
      status,
      organizationCreatedAt: organization.created_at,
      paidThrough: subscription?.paid_through ?? null,
      enforcementEnabled: setting?.enforcement_enabled === true,
      isPlatformAdmin: false,
      now,
    });
    return {
      organization_id: organization.id,
      organization_name: organization.display_name,
      organization_created_at: organization.created_at,
      plan_id: subscription?.plan_id ?? null,
      status,
      billing_provider: subscription?.billing_provider ?? null,
      last_payment_at: subscription?.last_payment_at ?? null,
      paid_through: subscription?.paid_through ?? null,
      access_until: subscription?.access_until ?? decision.accessUntil,
      subscription_updated_at: subscription?.updated_at ?? null,
      access_allowed: decision.allowed,
      access_reason: decision.reason,
      review_required: !subscription || decision.reason === "legacy_unreviewed",
    };
  });
  const last = page.at(-1);
  const nextCursor = hasMore && last
    ? encodeCursor({ created_at: last.created_at, id: last.id })
    : null;
  if (hasMore && !nextCursor) {
    return fail("internal_error", "Pagination cursor signing is unavailable", 503, { requestId });
  }
  return ok(rows, {
    requestId,
    meta: { has_more: hasMore, cursor: nextCursor },
  });
}
