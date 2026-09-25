import type { SupabaseClient } from "@supabase/supabase-js";

import { fimDoPeriodoPago } from "@/lib/billing/acesso-comercial";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolverPlanoIdDoPostback, type ReferenciasDePlanoMonetizze } from "./plano-do-postback";
import {
  resolveMonetizzeOrganization,
  type OrganizationResolution,
} from "./resolver-organizacao";
import type { EventoMonetizzeNormalizado } from "./parser";

export type ResultadoProcessamentoMonetizze = {
  status: "applied" | "duplicate" | "pending_match" | "ignored_unknown_product" |
    "ignored_event" | "ignored_out_of_order" | "failed";
};

type Rpc = SupabaseClient["rpc"];

type Dependencies = {
  secret: string;
  planReferences: ReferenciasDePlanoMonetizze;
  rpc?: Rpc;
  resolveOrganization?: typeof resolveMonetizzeOrganization;
};

function maisTresDias(iso: string | null): string | null {
  if (!iso) return null;
  const data = new Date(iso);
  data.setUTCDate(data.getUTCDate() + 3);
  return data.toISOString();
}

function camposDoPlano(referencia: string | null): { get(nome: string): string | null } {
  return { get: (nome) => nome === "plano[referencia]" ? referencia : null };
}

export async function processarPostbackMonetizze(
  evento: EventoMonetizzeNormalizado,
  dependencies: Dependencies,
): Promise<ResultadoProcessamentoMonetizze> {
  const planId = resolverPlanoIdDoPostback(camposDoPlano(evento.planReference), dependencies.planReferences);
  const resolveOrganization = dependencies.resolveOrganization ?? resolveMonetizzeOrganization;
  const admin = dependencies.rpc ? null : createAdminClient();
  const rpc = dependencies.rpc ?? admin!.rpc.bind(admin);

  let resolution: OrganizationResolution | null = null;
  let outcome: "applied" | "pending_match" | "ignored_unknown_product" | "ignored_event";
  if (evento.targetStatus === null) {
    outcome = "ignored_event";
  } else if (planId === null) {
    outcome = "ignored_unknown_product";
  } else {
    resolution = await resolveOrganization({
      sourceReference: evento.sourceReference,
      buyerEmail: evento.buyerEmail,
    }, { secret: dependencies.secret });
    outcome = resolution.kind === "resolved" ? "applied" : "pending_match";
  }

  const paidThrough = evento.paymentConfirmedAt ? fimDoPeriodoPago(evento.paymentConfirmedAt) : null;
  const organizationId = resolution?.kind === "resolved" ? resolution.organizationId : null;
  const buyerEmailHash = resolution?.buyerEmailHash ?? null;
  const buyerEmailMasked = resolution?.buyerEmailMasked ?? null;

  const { data, error } = await rpc("fn_processar_evento_monetizze", {
    p_webhook_id: evento.webhookId,
    p_sale_code: evento.saleCode,
    p_sale_status: evento.saleStatus,
    p_event_kind: evento.eventKind,
    p_event_at: evento.eventAt,
    p_installment_number: evento.installmentNumber,
    p_product_code: evento.productCode,
    p_subscription_code: evento.subscriptionCode,
    p_buyer_email_hash: buyerEmailHash,
    p_buyer_email_masked: buyerEmailMasked,
    p_organization_id: organizationId,
    p_plan_id: planId,
    p_target_status: evento.targetStatus,
    p_payment_confirmed_at: evento.paymentConfirmedAt,
    p_paid_through: paidThrough,
    p_access_until: maisTresDias(paidThrough),
    p_outcome: outcome,
    p_error_code: null,
  } as never);
  if (error) throw new Error(`Falha ao registrar evento de cobrança: ${error.message}`);
  if (!data || typeof data !== "object" || Array.isArray(data) || typeof (data as { status?: unknown }).status !== "string") {
    throw new Error("Resposta inválida ao registrar evento de cobrança");
  }
  return { status: (data as ResultadoProcessamentoMonetizze).status };
}
