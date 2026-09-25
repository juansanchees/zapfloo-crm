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

const REVIEW_PAGE_SIZE = 1_000;

type ReviewError = { message: string };
type OrganizationReviewRow = { id: string; created_at: string };
type SubscriptionReviewRow = {
  organization_id: string;
  status: string;
  paid_through: string | null;
};

async function readAllPages<T>(
  readPage: (from: number, to: number) => Promise<{
    data: T[] | null;
    error: ReviewError | null;
    count: number | null;
  }>,
): Promise<{ data: T[]; error: null } | { data: null; error: ReviewError }> {
  const rows: T[] = [];
  for (let from = 0; ; from = rows.length) {
    const page = await readPage(from, from + REVIEW_PAGE_SIZE - 1);
    if (page.error) return { data: null, error: page.error };
    if (page.count === null) {
      return { data: null, error: { message: "Exact count unavailable for billing review" } };
    }
    const current = page.data ?? [];
    rows.push(...current);
    if (rows.length === page.count) return { data: rows, error: null };
    if (current.length === 0 || rows.length > page.count) {
      return { data: null, error: { message: "Incomplete billing review pagination" } };
    }
  }
}

async function requireAdmin(requestId: string) {
  try {
    return { ok: true as const, context: await requirePlatformAdmin() };
  } catch {
    return {
      ok: false as const,
      response: fail("forbidden", "Platform admin required", 403, { requestId }),
    };
  }
}

async function readReview() {
  const admin = createAdminClient();
  const [settingResult, pendingResult, organizationsResult, subscriptionsResult] = await Promise.all([
    admin
      .from("platform_billing_settings")
      .select("enforcement_enabled,updated_at,updated_by")
      .eq("singleton", true)
      .maybeSingle(),
    admin
      .from("billing_provider_events")
      .select("id", { count: "exact", head: true })
      .eq("outcome", "pending_match"),
    readAllPages<OrganizationReviewRow>(async (from, to) => admin
      .from("organizations")
      .select("id,created_at", { count: "exact" })
      .order("id", { ascending: true })
      .range(from, to)),
    readAllPages<SubscriptionReviewRow>(async (from, to) => admin
      .from("organization_subscriptions")
      .select("organization_id,status,paid_through", { count: "exact" })
      .order("organization_id", { ascending: true })
      .range(from, to)),
  ]);
  const error = settingResult.error ?? organizationsResult.error ?? subscriptionsResult.error ?? pendingResult.error;
  if (error) return { error } as const;

  const byOrganization = new Map(
    organizationsResult.data === null || subscriptionsResult.data === null
      ? []
      : subscriptionsResult.data.map((row) => [row.organization_id, row] as const),
  );
  let expiredCount = 0;
  let legacyCount = 0;
  let pausedCount = 0;
  const now = new Date();
  for (const organization of organizationsResult.data ?? []) {
    const subscription = byOrganization.get(organization.id);
    if (!subscription) {
      legacyCount += 1;
      continue;
    }
    const decision = decidirAcessoComercial({
      status: subscription.status as SituacaoComercialDaAssinatura,
      organizationCreatedAt: organization.created_at,
      paidThrough: subscription.paid_through,
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
  if (!authorization.ok) return authorization.response;

  const review = await readReview();
  if ("error" in review) {
    return fail("internal_error", "Failed to review billing enforcement", 500, { requestId });
  }
  return ok({
    ...review.data,
    can_mutate: authorization.context.platformAdmin.scope === "full",
  }, { requestId });
}

export async function PATCH(request: NextRequest) {
  const requestId = randomUUID();
  const authorization = await requireAdmin(requestId);
  if (!authorization.ok) return authorization.response;
  if (authorization.context.platformAdmin.scope !== "full") {
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
      updated_by: authorization.context.user.id,
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
    actorUserId: authorization.context.user.id,
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
