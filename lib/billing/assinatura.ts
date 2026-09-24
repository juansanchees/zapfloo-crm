import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PLANO_PADRAO_DE_ORGANIZACAO_EXISTENTE,
  resolverAcessoDaAssinatura,
  type AcessoResolvido,
  type AssinaturaDaOrganizacao,
  type LimiteDoPlano,
  type PlanoId,
  type RecursoDoPlano,
  type SituacaoComercialDaAssinatura,
  limiteDoPlano,
  planoMinimoParaLimite,
  planoMinimoParaRecurso,
  recursoDoPlano,
} from "@/lib/billing/planos";

export type LinhaDeAssinatura = {
  organization_id: string;
  plan_id: PlanoId;
  status: SituacaoComercialDaAssinatura;
  paid_through: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type AssinaturaResolvida = {
  linha: LinhaDeAssinatura | null;
  acesso: AcessoResolvido;
};

export async function assinaturaDaOrganizacao(orgId: string): Promise<AssinaturaResolvida> {
  const admin = createAdminClient();
  const [assinaturaRes, orgRes] = await Promise.all([
    admin
      .from("organization_subscriptions")
      .select("organization_id,plan_id,status,paid_through,created_at,updated_at,updated_by")
      .eq("organization_id", orgId)
      .maybeSingle(),
    admin.from("organizations").select("created_at").eq("id", orgId).maybeSingle(),
  ]);

  if (orgRes.error || !orgRes.data) {
    throw new Error(orgRes.error?.message ?? "Organização não encontrada.");
  }

  const criadaEm = String(orgRes.data.created_at);
  if (assinaturaRes.error) {
    logger.warn("billing: assinatura indisponível — usando compatibilidade para organização existente", {
      organization_id: orgId,
      causa: assinaturaRes.error.message,
    });
  }

  const linha = assinaturaRes.error
    ? null
    : ((assinaturaRes.data as LinhaDeAssinatura | null) ?? null);
  const base: AssinaturaDaOrganizacao = linha
    ? {
        plano: linha.plan_id,
        // Recusado/cancelado preservam os recursos do plano até o gate
        // comercial decidir o fim do período pago. Não são um quarto plano.
        situacao:
          linha.status === "recusado" || linha.status === "cancelado"
            ? "ativo"
            : linha.status,
        organizacaoCriadaEm: criadaEm,
      }
    : {
        plano: PLANO_PADRAO_DE_ORGANIZACAO_EXISTENTE,
        situacao: "ativo",
        organizacaoCriadaEm: criadaEm,
      };

  return { linha, acesso: resolverAcessoDaAssinatura(base) };
}

export type VereditoDePlano =
  | { ok: true; acesso: AcessoResolvido }
  | { ok: false; acesso: AcessoResolvido; planoMinimo: PlanoId | null; motivo: "recurso" | "limite" };

export async function autorizarRecurso(
  orgId: string,
  recurso: RecursoDoPlano,
): Promise<VereditoDePlano> {
  const { acesso } = await assinaturaDaOrganizacao(orgId);
  if (recursoDoPlano(acesso, recurso)) return { ok: true, acesso };
  return { ok: false, acesso, planoMinimo: planoMinimoParaRecurso(recurso), motivo: "recurso" };
}

export async function autorizarQuantidade(
  orgId: string,
  limite: LimiteDoPlano,
  quantidadeDepois: number,
): Promise<VereditoDePlano> {
  const { acesso } = await assinaturaDaOrganizacao(orgId);
  const teto = limiteDoPlano(acesso, limite);
  if (teto === null || quantidadeDepois <= teto) return { ok: true, acesso };
  return {
    ok: false,
    acesso,
    planoMinimo: planoMinimoParaLimite(limite, quantidadeDepois),
    motivo: "limite",
  };
}

export function nomeDoPlanoDoVeredito(veredito: Extract<VereditoDePlano, { ok: false }>): string {
  if (!veredito.planoMinimo) return "superior";
  const nomes: Record<PlanoId, string> = { basico: "Básico", essencial: "Essencial", completo: "Completo" };
  return nomes[veredito.planoMinimo];
}

export function mensagemDePlano(veredito: Extract<VereditoDePlano, { ok: false }>): string {
  return `Disponível no plano ${nomeDoPlanoDoVeredito(veredito)}.`;
}
