import { createHash } from "node:crypto";

export const COOKIE_EXPLORACAO = "onboarding_explore";

/** Preferência de navegação, NÃO credencial. Não dispensa sessão, RBAC ou MFA. */
export function valorDaExploracao(userId: string, orgId: string): string {
  return createHash("sha256").update(JSON.stringify([userId, orgId])).digest("hex");
}

export function exploracaoPertenceA(valor: string | undefined, userId: string, orgId: string): boolean {
  return Boolean(userId && orgId && valor && valor === valorDaExploracao(userId, orgId));
}
