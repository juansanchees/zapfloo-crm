import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { decidirAcessoComercial } from "@/lib/billing/acesso-comercial";
import type { SituacaoComercialDaAssinatura } from "@/lib/billing/planos";
import { createAdminClient } from "@/lib/supabase/admin";

const updateSchema = z.object({
  enforcement_enabled: z.boolean(),
  confirmation: z.string(),
}).strict().superRefine((value, context) => {
  const expected = value.enforcement_enabled
    ? "ATIVAR BLOQUEIO COMERCIAL"
    : "DESATIVAR BLOQUEIO COMERCIAL";
  if (value.confirmation !== expected) {
    context.addIssue({ code: "custom", path: ["confirmation"], message: "Confirmação inválida" });
  }
});

async function requireAdmin(requestId: string) {
  try {
    return await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Platform admin required", 403, { requestId });
  }
}

async function readReview() {
  const admin = createAdminClient();
  const [settingResult, organizationsResult, subscriptionsResult, pendingResult] = await Promise.all([
    admin
      .from("platform_billing_settings")
      .select("enforcement_enabled,updated_at,updated_by")
      .eq("singleton", true)
      .maybeSingle(),
    admin.from("organizations").select("id,created_at"),
    admin.from("organization_subscriptions").select("organization_id,status,paid_through"),
    admin
      .from("billing_provider_events")
      .select("id", { count: "exact", head: true })
      .eq("outcome", "pending_match"),
  ]);
  const error = settingResult.error ?? organizationsResult.error ?? subscriptionsResult.error ?? pendingResult.error;
  if (error) return { error } as const;

  const byOrganization = new Map(
    (subscriptionsResult.data ?? []).map((row) => [row.organization_id, row]),
  );
  let expiredCount = 0;
  let legacyCount = 0;
  let pausedCount = 0;
  const now = new Date();
  for (const organization of organizationsResult.data ?? []) {
    const subscription = byOrganization.get(organization.id);
    const decision = decidirAcessoComercial({
      status: (subscription?.status ?? "ativo") as SituacaoComercialDaAssinatura,
      organizationCreatedAt: organization.created_at,
      paidThrough: subscription?.paid_through ?? null,
      enforcementEnabled: true,
      isPlatformAdmin: false,
      now,
    });
    if (decision.reason === "legacy_unreviewed") legacyCount += 1;
    else if (decision.reason === "paused") pausedCount += 1;
    else if (!decision.allowed) expiredCount += 1;
  }

  return {
    data: {
      enforcement_enabled: settingResult.data?.enforcement_enabled === true,
      updated_at: settingResult.data?.updated_at ?? null,
      updated_by: settingResult.data?.updated_by ?? null,
      review: {
        total_organizations: organizationsResult.data?.length ?? 0,
        expired_count: expiredCount,
        legacy_count: legacyCount,
        paused_count: pausedCount,
        pending_count: pendingResult.count ?? 0,
      },
    },
  } as const;
}

export async function GET() {
  const requestId = randomUUID();
  const authorization = await requireAdmin(requestId);
  if (authorization instanceof Response) return authorization;

  const review = await readReview();
  if ("error" in review) {
    return fail("internal_error", "Failed to review billing enforcement", 500, { requestId });
  }
  return ok({
    ...review.data,
    can_mutate: authorization.platformAdmin.scope === "full",
  }, { requestId });
}

export async function PATCH(request: NextRequest) {
  const requestId = randomUUID();
  const authorization = await requireAdmin(requestId);
  if (authorization instanceof Response) return authorization;
  if (authorization.platformAdmin.scope !== "full") {
    return fail("forbidden", "Full platform admin scope required", 403, { requestId });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("validation_error", "Invalid JSON body", 400, { requestId });
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return fail("validation_error", "Explicit confirmation required", 400, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const admin = createAdminClient();
  const { data: before, error: beforeError } = await admin
    .from("platform_billing_settings")
    .select("enforcement_enabled")
    .eq("singleton", true)
    .maybeSingle();
  if (beforeError) {
    return fail("internal_error", "Failed to load billing settings", 500, { requestId });
  }
  const beforeEnabled = before?.enforcement_enabled === true;

  const now = new Date().toISOString();
  const { data: after, error: updateError } = await admin
    .from("platform_billing_settings")
    .update({
      enforcement_enabled: parsed.data.enforcement_enabled,
      updated_at: now,
      updated_by: authorization.user.id,
    })
    .eq("singleton", true)
    .select("enforcement_enabled,updated_at,updated_by")
    .single();
  if (updateError) {
    return fail("internal_error", "Failed to update billing settings", 500, { requestId });
  }

  // O interruptor afeta todos os tenants. Aguarde a tentativa de auditoria
  // antes de confirmar sucesso para não haver uma janela em que a UI diz
  // "ativado" enquanto o escritor ainda nem tentou registrar o ator.
  await audit({
    action: "platform_admin.billing_enforcement_changed",
    actorUserId: authorization.user.id,
    actingAsPlatformAdmin: true,
    bypassedRls: true,
    requestId,
    resourceType: "platform_billing_settings",
    metadata: {
      before: { enforcement_enabled: beforeEnabled },
      after: { enforcement_enabled: after.enforcement_enabled === true },
    },
  });

  return ok({
    enforcement_enabled: after.enforcement_enabled,
    updated_at: after.updated_at,
    updated_by: after.updated_by,
  }, { requestId });
}
