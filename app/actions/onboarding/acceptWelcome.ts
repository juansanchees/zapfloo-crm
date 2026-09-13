"use server";

/**
 * Server Action: completes the welcome step. Updates `display_name`/`timezone`
 * on the org and stamps `onboarding_state.welcome` with accepted_at + meta.
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { welcomeSchema } from "@/lib/schemas/onboarding";
import { requireOnboardingCtx, loadOnboardingState, OnboardingError } from "./_shared";
import { contextoDoRascunho } from "@/lib/onboarding/contexto-rascunho";
import { createAdminClient } from "@/lib/supabase/admin";
import { processarSiteDaOrganizacao } from "@/lib/onboarding/site/servico";

export type AcceptWelcomeResult =
  | { ok: true }
  | { ok: false; error: OnboardingError["code"] | "invalid_input"; details?: unknown };

export async function acceptWelcome(formData: FormData): Promise<AcceptWelcomeResult> {
  let ctx;
  try {
    ctx = await requireOnboardingCtx();
  } catch (err) {
    if (err instanceof OnboardingError) return { ok: false, error: err.code };
    throw err;
  }

  if (formData.get("expected_context") !== contextoDoRascunho(ctx.userId, ctx.orgId)) return { ok: false, error: "forbidden" };
  const raw = {
    display_name: String(formData.get("display_name") ?? "").trim(),
    segmento: String(formData.get("segmento") ?? "").trim() || undefined,
    o_que_faz: String(formData.get("o_que_faz") ?? "").trim() || undefined,
    site_do_negocio: String(formData.get("site_do_negocio") ?? "").trim() || undefined,
    timezone: String(formData.get("timezone") ?? "America/Sao_Paulo"),
    accepted_terms_at: new Date().toISOString(),
  };

  let input;
  try {
    input = welcomeSchema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, error: "invalid_input", details: err.flatten() };
    }
    throw err;
  }

  try {
    const { state, onboardedAt } = await loadOnboardingState(ctx.orgId);
    if (onboardedAt) return { ok: false, error: "forbidden" };
    const nextState = {
        ...state,
        welcome: {
          accepted_at: state.welcome?.accepted_at ?? input.accepted_terms_at ?? new Date().toISOString(),
          timezone: input.timezone,
          display_name: input.display_name,
          ...(input.segmento ? { segmento: input.segmento } : {}),
          ...(input.o_que_faz ? { o_que_faz: input.o_que_faz } : {}),
          ...(input.site_do_negocio ? { site_do_negocio: input.site_do_negocio, site_leitura_pendente: true } : {}),
        },
    };
    const { data, error } = await createAdminClient().from("organizations")
      .update({ onboarding_state: nextState, display_name: input.display_name, timezone: input.timezone })
      .eq("id", ctx.orgId).eq("onboarding_state", JSON.stringify(state)).eq("status", "active")
      .is("onboarded_at", null).is("suspended_at", null).is("redacted_at", null).select("id").maybeSingle();
    if (error || !data) return { ok: false, error: "db_error" };
  } catch (err) {
    if (err instanceof OnboardingError) return { ok: false, error: "db_error", details: err.message };
    throw err;
  }

  // Não há espera por HTTP/IA neste passo. A intenção de leitura já está no
  // mesmo UPDATE do welcome; o cron consegue retomá-la mesmo se o servidor
  // parar antes deste callback. O serviço revalida a URL e o tenant persistidos.
  if (input.site_do_negocio) after(() => processarSiteDaOrganizacao(ctx.orgId));

  // MEDIDO percorrendo o wizard: o cabeçalho continuava dizendo "Minha Empresa"
  // (o nome que o instalador deixa) durante TODO o resto do onboarding, mesmo
  // com o banco já gravado com o nome novo. O layout do onboarding é
  // compartilhado entre os passos e o App Router não o re-renderiza numa
  // navegação dentro da mesma árvore — então ele servia o nome do primeiro
  // render até um recarregamento completo.
  //
  // A pessoa acabou de dizer como se chama o negócio dela e o sistema seguia
  // chamando-o de outra coisa. Invalidar o layout é o que faz o nome novo
  // aparecer no passo seguinte.
  revalidatePath("/onboarding", "layout");

  await audit({
    action: "onboarding.welcome_completed",
    actorUserId: ctx.userId,
    organizationId: ctx.orgId,
    resourceType: "organization",
    resourceId: ctx.orgId,
    // O ramo NÃO entra no audit: é texto livre que o dono escreveu, e o audit
    // é append-only com retenção de 5 anos — nada que a anonimização da LGPD
    // não alcance depois deve cair lá por conveniência de diagnóstico.
    metadata: { display_name: input.display_name, timezone: input.timezone },
  });

  redirect("/onboarding");
}
