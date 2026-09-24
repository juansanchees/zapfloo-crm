import { redirect } from "next/navigation";

import { BillingClient } from "./_client";
import type { AccessDecision } from "@/lib/billing/acesso-comercial";
import { avaliarAcessoComercial } from "@/lib/billing/acesso-server";
import { construirCheckoutMonetizze, type CheckoutUrlsPorPlano } from "@/lib/billing/checkout";
import { PLANOS, type PlanoId, type SituacaoComercialDaAssinatura } from "@/lib/billing/planos";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plano e pagamentos" };

const STATUS_VALIDOS = new Set<SituacaoComercialDaAssinatura>([
  "teste",
  "ativo",
  "recusado",
  "cancelado",
  "pausado",
]);

function planoValido(valor: string | null | undefined): PlanoId | null {
  return valor && Object.hasOwn(PLANOS, valor) ? (valor as PlanoId) : null;
}

function statusValido(valor: string | null | undefined): SituacaoComercialDaAssinatura | null {
  return valor && STATUS_VALIDOS.has(valor as SituacaoComercialDaAssinatura)
    ? (valor as SituacaoComercialDaAssinatura)
    : null;
}

const ACESSO_INDISPONIVEL: AccessDecision = {
  allowed: false,
  reason: "invalid_billing_data",
  accessUntil: null,
  enforcementEnabled: true,
};

/**
 * Porta de regularização do tenant. A leitura usa service role somente depois
 * de resolver a organização pela sessão validada, e sempre filtra pelo id
 * confiável da organização ativa.
 */
export default async function BillingPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg || ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  const admin = createAdminClient();
  const [assinaturaResult, acessoResult] = await Promise.allSettled([
    admin
      .from("organization_subscriptions")
      .select("plan_id,status,access_until,paid_through")
      .eq("organization_id", activeOrg.orgId)
      .maybeSingle(),
    // A tela descreve a assinatura da organização, não o bypass pessoal do
    // platform admin. O mesmo resolvedor compartilhado continua sendo a fonte.
    avaliarAcessoComercial(activeOrg.orgId),
  ]);

  const assinaturaQuery =
    assinaturaResult.status === "fulfilled"
      ? assinaturaResult.value
      : { data: null, error: null };
  const assinaturaRaw = assinaturaQuery.error ? null : assinaturaQuery.data;
  const assinatura = {
    plan_id: planoValido(assinaturaRaw?.plan_id),
    status: statusValido(assinaturaRaw?.status),
    access_until: assinaturaRaw?.access_until ?? null,
    paid_through: assinaturaRaw?.paid_through ?? null,
  };
  const acesso = acessoResult.status === "fulfilled" ? acessoResult.value : ACESSO_INDISPONIVEL;

  const checkoutUrls: CheckoutUrlsPorPlano = {
    basico: env.MONETIZZE_CHECKOUT_BASICO,
    essencial: env.MONETIZZE_CHECKOUT_ESSENCIAL,
    completo: env.MONETIZZE_CHECKOUT_COMPLETO,
  };
  const checkouts = Object.fromEntries(
    (Object.keys(PLANOS) as PlanoId[]).map((plano) => [
      plano,
      construirCheckoutMonetizze({
        plano,
        email: user.email,
        organizationId: activeOrg.orgId,
        secret: env.MONETIZZE_CHAVE_UNICA,
        checkoutUrls,
      }),
    ]),
  ) as Record<PlanoId, string | null>;

  return (
    <BillingClient
      idioma={user.idioma}
      assinatura={assinatura}
      acesso={acesso}
      checkouts={checkouts}
    />
  );
}
