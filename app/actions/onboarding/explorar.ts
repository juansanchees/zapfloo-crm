"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_EXPLORACAO, valorDaExploracao } from "@/lib/onboarding/exploracao";
import { requireOnboardingCtx } from "./_shared";
import { cookieSecure } from "@/lib/supabase/cookie-secure";
import { logger } from "@/lib/logger";

export type FalhaAoExplorarCrm =
  | "auth_required"
  | "no_active_org"
  | "forbidden"
  | "mfa_required"
  | "unavailable";

export type ResultadoExplorarCrm = { ok: false; error: FalhaAoExplorarCrm };

const FALHAS_ESPERADAS = new Set<FalhaAoExplorarCrm>([
  "auth_required",
  "no_active_org",
  "forbidden",
  "mfa_required",
]);

function falhaEsperada(cause: unknown): FalhaAoExplorarCrm | null {
  if (!cause || typeof cause !== "object" || !("code" in cause)) return null;
  const code = String(cause.code);
  return FALHAS_ESPERADAS.has(code as FalhaAoExplorarCrm)
    ? code as FalhaAoExplorarCrm
    : null;
}

/** Só muda a preferência deste navegador; não conclui a organização. */
export async function explorarCrm(): Promise<ResultadoExplorarCrm | never> {
  try {
    const ctx = await requireOnboardingCtx();
    const store = await cookies();
    store.set(COOKIE_EXPLORACAO, valorDaExploracao(ctx.userId, ctx.orgId), {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieSecure(),
      path: "/",
    });
  } catch (cause) {
    const expected = falhaEsperada(cause);
    const error = expected ?? "unavailable";
    // O código canônico basta para operar o defeito. Mensagem/objeto crus podem
    // carregar dados de sessão ou do banco e nunca entram no log.
    logger.error("[onboarding/explorar] não consegui preparar a entrada no CRM", {
      error,
      expected: expected !== null,
    });
    return { ok: false, error };
  }

  // Fora do try/catch de propósito: `redirect` lança o controle de navegação
  // do Next e nunca pode ser convertido em falha de aplicação.
  redirect("/app/inbox");
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
  });
  redirect(destination);
}
