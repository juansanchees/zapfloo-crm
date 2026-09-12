import "server-only";
import { loadOnboardingState } from "@/app/actions/onboarding/_shared";
import { lerEnsaio } from "@/app/actions/onboarding/ensaio";
import { contextoDoRascunho } from "./contexto-rascunho";
import { progressoRevisado } from "./passos";

/** IDs recebidos somente dos guards de página; leitura não altera progresso. */
export async function lerJornada(userId: string, orgId: string) {
  const loaded = await loadOnboardingState(orgId);
  const context = contextoDoRascunho(userId, orgId);
  const ai = loaded.state.ai;
  if (loaded.onboardedAt || ai?.flow !== "reviewed_draft_v2" || ai.restricted_activation) return { ...loaded, context };
  const read = await lerEnsaio({ expected_context: context });
  return { ...loaded, context, state: progressoRevisado(loaded.state, read.ok ? read.panel.proof : null) };
}
