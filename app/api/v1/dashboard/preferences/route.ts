import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { ApiError } from "@/lib/api/types";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import {
  dashboardLayoutSchema,
  sanitizeDashboardLayout,
} from "@/lib/dashboard/preferences";
import { validateRequest } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Isolamento em profundidade: a RLS restringe a linha ao auth.uid(), e a rota
 * repete a chave composta explicitamente. A preferência controla apresentação,
 * nunca consulta, SQL, organização ou permissão.
 */
export async function GET(_request: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "dashboard_preferences" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_dashboard_preferences")
    .select("layout, schema_version")
    .eq("organization_id", authz.org.orgId)
    .eq("user_id", authz.user.id)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });

  return ok(
    {
      layout: sanitizeDashboardLayout(data?.layout, authz.org.role),
      source: data ? "saved" : "default",
    },
    { requestId },
  );
}

export async function PUT(request: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "dashboard_preferences" });
  if (!authz.ok) return authz.response;

  let input;
  try {
    input = await validateRequest(dashboardLayoutSchema, request);
  } catch (error) {
    if (error instanceof ApiError) {
      return fail(error.code, error.message, error.status, {
        details: error.details,
        requestId,
      });
    }
    throw error;
  }

  const layout = sanitizeDashboardLayout(input, authz.org.role);
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_dashboard_preferences")
    .upsert(
      {
        organization_id: authz.org.orgId,
        user_id: authz.user.id,
        layout,
        schema_version: layout.schema_version,
      },
      { onConflict: "organization_id,user_id" },
    );
  if (error) return fail("internal_error", error.message, 500, { requestId });

  await audit({
    action: "dashboard.preferences_updated",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "dashboard_preferences",
    requestId,
    metadata: {
      schema_version: layout.schema_version,
      widget_count: layout.widgets.length,
      visible_count: layout.widgets.filter((widget) => widget.visible).length,
    },
  });

  return ok({ layout, source: "saved" }, { requestId });
}

export async function DELETE(_request: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "dashboard_preferences" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_dashboard_preferences")
    .delete()
    .eq("organization_id", authz.org.orgId)
    .eq("user_id", authz.user.id);
  if (error) return fail("internal_error", error.message, 500, { requestId });

  await audit({
    action: "dashboard.preferences_reset",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "dashboard_preferences",
    requestId,
    metadata: {},
  });

  return ok(
    { layout: sanitizeDashboardLayout(null, authz.org.role), source: "default" },
    { requestId },
  );
}
