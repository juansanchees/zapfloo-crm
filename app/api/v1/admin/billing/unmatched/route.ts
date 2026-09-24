import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().max(2048).optional(),
});

const cursorSchema = z.object({
  received_at: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
}).strict();

type Cursor = z.infer<typeof cursorSchema>;

const CURSOR_CONTEXT = "zapfloo:admin:billing-unmatched-cursor:v1";

function cursorKey(): Buffer | null {
  const secret = env.INTERNAL_SECRET.trim();
  if (secret.length < 16) return null;
  return createHmac("sha256", secret).update(`derive\0${CURSOR_CONTEXT}`, "utf8").digest();
}

function signCursorPayload(encoded: string): Buffer | null {
  const key = cursorKey();
  if (!key) return null;
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
  let received: Buffer;
  try {
    received = Buffer.from(signatureText, "base64url");
  } catch {
    return null;
  }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const raw = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const parsed = cursorSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const requestId = randomUUID();
  let adminContext: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    adminContext = await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Platform admin required", 403, { requestId });
  }

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) {
    return fail("validation_error", "Invalid query params", 400, {
      requestId,
      details: parsed.error.flatten(),
    });
  }
  const cursor = parsed.data.cursor ? decodeCursor(parsed.data.cursor) : null;
  if (parsed.data.cursor && !cursor) {
    return fail("validation_error", "Invalid cursor", 400, { requestId });
  }

  const admin = createAdminClient();
  let query = admin
    .from("billing_provider_events")
    .select(
      "id, provider, event_kind, event_at, product_code, plan_id, target_status, buyer_email_masked, received_at, error_code",
    )
    .eq("outcome", "pending_match")
    .order("received_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(parsed.data.limit + 1);

  if (cursor) {
    query = query.or(
      `received_at.lt.${cursor.received_at},and(received_at.eq.${cursor.received_at},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) {
    return fail("internal_error", "Failed to fetch unmatched billing events", 500, { requestId });
  }

  const rows = data ?? [];
  const hasMore = rows.length > parsed.data.limit;
  const page = hasMore ? rows.slice(0, parsed.data.limit) : rows;
  const last = page.at(-1);
  const nextCursor = hasMore && last
    ? encodeCursor({ received_at: last.received_at, id: last.id })
    : null;
  if (hasMore && !nextCursor) {
    return fail("internal_error", "Pagination cursor signing is unavailable", 503, { requestId });
  }

  void audit({
    action: "platform_admin.billing_unmatched_listed",
    actorUserId: adminContext.user.id,
    actingAsPlatformAdmin: true,
    bypassedRls: true,
    requestId,
    metadata: { count: page.length, has_more: hasMore },
  });

  return ok(page, {
    requestId,
    meta: { has_more: hasMore, cursor: nextCursor },
  });
}
