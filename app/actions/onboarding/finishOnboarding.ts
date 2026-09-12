"use server";

/**
 * Server Action: finalize onboarding — stamps `onboarded_at`, audits, and
 * emits the `tenant.onboarded` domain event. Idempotent: only fires the
 * event the first time `onboarded_at` flips from NULL.
 */
import { redirect } from "next/navigation";

import { audit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOnboardingCtx, OnboardingError } from "./_shared";
import { onboardingStateSchema } from "@/lib/schemas/onboarding";
import { proximoPasso } from "@/lib/onboarding/passos";
import { env } from "@/lib/env";

export type FinishOnboardingResult =
  | { ok: true; alreadyOnboarded: boolean }
  | { ok: false; error: OnboardingError["code"]; details?: unknown };

export async function finishOnboarding(): Promise<FinishOnboardingResult> {
  let ctx;
  try {
    ctx = await requireOnboardingCtx();
  } catch (err) {
    if (err instanceof OnboardingError) return { ok: false, error: err.code };
    throw err;
  }

  const admin = createAdminClient();

  const { data: existing, error: readError } = await admin
    .from("organizations")
    .select("onboarded_at,onboarding_state")
    .eq("id", ctx.orgId)
    .maybeSingle();

  const alreadyOnboarded = Boolean(existing?.onboarded_at);
  if (readError || !existing) return { ok: false, error: "db_error" };

  if (!alreadyOnboarded) {
    const state = onboardingStateSchema.safeParse(existing.onboarding_state);
    if (!state.success || proximoPasso(state.data, { lojaLigada: env.NUVEMSHOP_ENABLED })) return { ok: false, error: "forbidden" };
    const { data: changed, error } = await admin
      .from("organizations")
      .update({ onboarded_at: new Date().toISOString() })
      .eq("id", ctx.orgId)
      .eq("onboarding_state", JSON.stringify(existing.onboarding_state))
      .is("onboarded_at", null)
      .select("id").maybeSingle();
    if (error) return { ok: false, error: "db_error", details: error.message };
    if (!changed) return { ok: false, error: "forbidden" };

    await admin.from("event_log").insert({
      organization_id: ctx.orgId,
      event_type: "tenant.onboarded",
      payload: { completed_by: ctx.userId },
    });

    await audit({
      action: "onboarding.completed",
      actorUserId: ctx.userId,
      organizationId: ctx.orgId,
    });
    await audit({
      action: "tenant.onboarded",
      actorUserId: ctx.userId,
      organizationId: ctx.orgId,
    });
  }

  redirect("/app/inbox");
}
