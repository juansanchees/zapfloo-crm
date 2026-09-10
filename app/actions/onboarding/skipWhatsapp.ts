"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { audit } from "@/lib/audit";
import {
  confirmarCanalConectado,
  type ErroDaConfirmacaoDoCanal,
} from "@/lib/onboarding/confirmar-whatsapp";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOnboardingCtx, patchOnboardingState, OnboardingError } from "./_shared";

export async function skipWhatsapp(): Promise<void> {
  const ctx = await requireOnboardingCtx();
  await patchOnboardingState(ctx.orgId, {
    whatsapp: { status: "skipped", skipped: true },
  });
  await audit({
    action: "onboarding.whatsapp_skipped",
    actorUserId: ctx.userId,
    organizationId: ctx.orgId,
  });
  // O roteador do wizard decide o próximo step (Nuvemshop só existe com
  // NUVEMSHOP_ENABLED) — hardcodar aqui mandava o usuário pra um step oculto.
  redirect("/onboarding");
}

const marcarWhatsappSchema = z
  .object({ channel_session_id: z.string().uuid() })
  .strict();

type ErroAoMarcarWhatsapp =
  | OnboardingError["code"]
  | "invalid_input"
  | ErroDaConfirmacaoDoCanal;

/**
 * Falha devolvida à tela. O sucesso redireciona para o roteador do onboarding,
 * portanto não há um DTO de sucesso que possa ser confundido com conclusão.
 */
export type MarkWhatsappConfiguredResult = {
  ok: false;
  error: ErroAoMarcarWhatsapp;
};

/**
 * Conclui o passo somente depois de perguntar ao transporte no servidor.
 *
 * O navegador informa apenas o UUID observado na lista/rota escopada. Provider,
 * referência, organização e status vêm da sessão autenticada, do banco e do
 * adapter. Em especial, o espelho no banco pode continuar STARTING enquanto o
 * WAHA já responde WORKING; confiar só nele prenderia quem acabou de parear.
 */
export async function markWhatsappConfigured(
  input: unknown,
): Promise<MarkWhatsappConfiguredResult> {
  let ctx;
  try {
    ctx = await requireOnboardingCtx();
  } catch (err) {
    if (err instanceof OnboardingError) return { ok: false, error: err.code };
    throw err;
  }

  const parsed = marcarWhatsappSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  let confirmacao: Awaited<ReturnType<typeof confirmarCanalConectado>>;
  try {
    confirmacao = await confirmarCanalConectado(createAdminClient(), {
      organizationId: ctx.orgId,
      channelSessionId: parsed.data.channel_session_id,
    });
  } catch {
    return { ok: false, error: "db_error" };
  }
  if (!confirmacao.ok) return confirmacao;

  try {
    // Patch estreito: `patchOnboardingState` relê e preserva welcome, IA e os
    // demais passos; conectar um canal não ativa nem altera política da IA.
    await patchOnboardingState(ctx.orgId, {
      whatsapp: {
        channel_session_id: confirmacao.channelSessionId,
        status: "WORKING",
      },
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof OnboardingError ? err.code : "db_error",
    };
  }

  await audit({
    action: "onboarding.whatsapp_configured",
    actorUserId: ctx.userId,
    organizationId: ctx.orgId,
    resourceType: "channel_session",
    resourceId: confirmacao.channelSessionId,
    metadata: { status: "WORKING" },
  });
  redirect("/onboarding");
}

export async function skipNuvemshop(): Promise<void> {
  const ctx = await requireOnboardingCtx();
  await patchOnboardingState(ctx.orgId, {
    nuvemshop: { skipped: true },
  });
  await audit({
    action: "onboarding.nuvemshop_skipped",
    actorUserId: ctx.userId,
    organizationId: ctx.orgId,
  });
  redirect("/onboarding");
}

export async function markNuvemshopConfigured(): Promise<void> {
  const ctx = await requireOnboardingCtx();
  await patchOnboardingState(ctx.orgId, {
    nuvemshop: { connected_at: new Date().toISOString() },
  });
  redirect("/onboarding");
}

export { OnboardingError };
