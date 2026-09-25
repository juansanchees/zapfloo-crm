import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({
  organization_id: z.string().uuid(),
  reason: z.string().trim().min(5).max(500).refine((value) => !/[\r\n]/.test(value)),
}).strict();
const rpcResultSchema = z.object({
  status: z.enum([
    "linked",
    "ignored_out_of_order",
    "already_linked",
    "not_pending",
    "not_found",
    "organization_not_found",
    "invalid_event",
    "invalid_request",
  ]),
  event_id: z.string().uuid().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = randomUUID();
  let adminContext: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    adminContext = await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Platform admin required", 403, { requestId });
  }
  if (adminContext.platformAdmin.scope !== "full") {
    return fail("forbidden", "Full platform admin scope required", 403, { requestId });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return fail("validation_error", "Invalid JSON body", 400, { requestId });
  }
  const parsedParams = paramsSchema.safeParse(await params);
  const parsedBody = bodySchema.safeParse(rawBody);
  if (!parsedParams.success || !parsedBody.success) {
    return fail("validation_error", "Invalid reconciliation request", 400, { requestId });
  }

  const admin = createAdminClient();
  const { data: organization, error: organizationError } = await admin
    .from("organizations")
    .select("id")
    .eq("id", parsedBody.data.organization_id)
    .maybeSingle();
  if (organizationError) {
    return fail("internal_error", "Failed to validate organization", 500, { requestId });
  }
  if (!organization) {
    return fail("not_found", "Organization not found", 404, { requestId });
  }

  const { data, error } = await admin.rpc("fn_vincular_evento_monetizze", {
    p_event_id: parsedParams.data.id,
    p_organization_id: organization.id,
    p_actor_user_id: adminContext.user.id,
    p_reason: parsedBody.data.reason,
  });
  if (error) {
    return fail("internal_error", "Failed to link billing event", 500, { requestId });
  }
  const result = rpcResultSchema.safeParse(data);
  if (!result.success) {
    return fail("internal_error", "Invalid billing reconciliation result", 500, { requestId });
  }

  if (result.data.status === "already_linked" || result.data.status === "not_pending") {
    return fail("state_conflict", "Billing event is no longer pending", 409, { requestId });
  }
  if (result.data.status === "not_found") {
    return fail("not_found", "Billing event not found", 404, { requestId });
  }
  if (result.data.status === "organization_not_found") {
    return fail("not_found", "Organization not found", 404, { requestId });
  }
  if (result.data.status === "invalid_event" || result.data.status === "invalid_request") {
    return fail("state_conflict", "Billing event cannot be linked", 409, { requestId });
  }

  // A própria RPC grava before/after e auditoria NA MESMA transação. Auditar
  // aqui criaria uma segunda linha fora do commit atômico que queremos provar.
  return ok({ event_id: result.data.event_id, status: result.data.status }, { requestId });
}
