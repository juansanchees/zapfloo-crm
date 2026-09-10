"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_EXPLORACAO, valorDaExploracao } from "@/lib/onboarding/exploracao";
import { requireOnboardingCtx } from "./_shared";
import { cookieSecure } from "@/lib/supabase/cookie-secure";

/** Só muda a preferência deste navegador; não conclui a organização. */
export async function explorarCrm(): Promise<void> {
  return entrarNoCrm("/app/inbox");
}

export async function gerenciarAgenteDoOnboarding(): Promise<void> {
  return entrarNoCrm("/app/ai/agents");
}

export async function configurarChaveDoOnboarding(): Promise<void> {
  return entrarNoCrm("/app/ai/credentials");
}

async function entrarNoCrm(destination: "/app/inbox" | "/app/ai/agents" | "/app/ai/credentials"): Promise<void> {
  const ctx = await requireOnboardingCtx();
  const store = await cookies();
  store.set(COOKIE_EXPLORACAO, valorDaExploracao(ctx.userId, ctx.orgId), {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(destination);
}
