/** Metas operacionais guardadas em `organizations.settings.operational_goals`. */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import {
  operationalGoalsFromSettings,
  operationalGoalsSchema,
} from "@/lib/metas/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "operational_goals" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });

  return ok(operationalGoalsFromSettings(data?.settings), { requestId });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "operational_goals" });
  if (!authz.ok) return authz.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("validation_failed", "Dados inválidos.", 422, { requestId });
  }
  const parsed = operationalGoalsSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors,
    });
  }

  // `organizations` só aceita escrita do platform admin por RLS. O papel foi
  // decidido antes, com org de fonte confiável; por isso o admin client recebe
  // o filtro explícito de tenant tanto na leitura quanto na escrita.
  const admin = createAdminClient();
  const { data: current, error: readError } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (readError) return fail("internal_error", readError.message, 500, { requestId });
  if (!current) return fail("tenant_not_found", "Organização não encontrada.", 404, { requestId });

  const currentSettings = (current.settings as Record<string, unknown> | null) ?? {};
  const nextSettings = { ...currentSettings, operational_goals: parsed.data };
  const { error: updateError } = await admin
    .from("organizations")
    .update({ settings: nextSettings })
    .eq("id", authz.org.orgId);
  if (updateError) return fail("internal_error", updateError.message, 500, { requestId });

  // A lista canônica de audit actions é mantida fora desta superfície por
  // ownership da leva. O cast só permite registrar o código já contratado;
  // metadata não expõe valores ou metas individuais.
  void audit({
    action: "goals.config_changed" as never,
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "organization",
    resourceId: authz.org.orgId,
    requestId,
    metadata: {
      has_team_revenue_target: parsed.data.team.monthly_revenue_cents !== undefined,
      has_team_conversations_target: parsed.data.team.monthly_conversations !== undefined,
      members_with_targets: Object.keys(parsed.data.members).length,
    },
  });

  return ok(parsed.data, { requestId });
}
