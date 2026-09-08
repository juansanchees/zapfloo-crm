import { createHash } from "node:crypto";

/** Detector de formulário antigo, NÃO credencial. Autorização continua no contexto da sessão. */
export function contextoDoRascunho(userId: string, orgId: string): string {
  return createHash("sha256").update(JSON.stringify(["onboarding-draft", userId, orgId])).digest("hex");
}
