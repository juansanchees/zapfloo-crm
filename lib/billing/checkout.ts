import { createCheckoutReference } from "@/lib/billing/monetizze/checkout-reference";
import type { PlanoId } from "@/lib/billing/planos";

const MONETIZZE_CHECKOUT_HOST = "app.monetizze.com.br";

export type CheckoutUrlsPorPlano = Record<PlanoId, string>;

export type ConstruirCheckoutInput = {
  plano: PlanoId;
  email: string;
  organizationId: string;
  secret: string;
  checkoutUrls: CheckoutUrlsPorPlano;
  now?: Date;
  /** Somente para tornar a assinatura determinística em teste. */
  nonce?: string;
};

/**
 * Monta o checkout no servidor. A Monetizze documenta `email` e `src` como
 * parâmetros de URL; a referência assinada impede confiar em UUID vindo do
 * navegador e o segredo nunca atravessa a fronteira do Server Component.
 */
export function construirCheckoutMonetizze(input: ConstruirCheckoutInput): string | null {
  const raw = input.checkoutUrls[input.plano]?.trim();
  if (!raw || !input.secret.trim()) return null;

  let checkout: URL;
  try {
    checkout = new URL(raw);
  } catch {
    return null;
  }

  if (
    checkout.protocol !== "https:" ||
    checkout.hostname !== MONETIZZE_CHECKOUT_HOST ||
    checkout.username !== "" ||
    checkout.password !== ""
  ) {
    return null;
  }

  let referencia: string;
  try {
    referencia = createCheckoutReference(input.organizationId, {
      secret: input.secret,
      now: input.now,
      nonce: input.nonce,
    });
  } catch {
    return null;
  }

  checkout.searchParams.set("email", input.email);
  checkout.searchParams.set("src", referencia);
  return checkout.toString();
}
