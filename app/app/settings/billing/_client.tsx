"use client";

import { ArrowSquareOut, CalendarBlank, CheckCircle, CreditCard, Warning } from "@/lib/ui/icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AccessDecision, AccessDecisionReason } from "@/lib/billing/acesso-comercial";
import { PLANOS, formatarPrecoMensal, type PlanoId, type SituacaoComercialDaAssinatura } from "@/lib/billing/planos";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

type AssinaturaVisivel = {
  plan_id: PlanoId | null;
  status: SituacaoComercialDaAssinatura | null;
  access_until: string | null;
  paid_through: string | null;
};

export type BillingClientProps = {
  idioma: Idioma;
  assinatura: AssinaturaVisivel;
  acesso: AccessDecision;
  podeComprar: boolean;
  checkouts: Record<PlanoId, string | null>;
};

const PLANOS_IDS = Object.keys(PLANOS) as PlanoId[];

function rotuloStatus(status: SituacaoComercialDaAssinatura | null): string {
  if (status === "teste") return "Em teste";
  if (status === "ativo") return "Ativo";
  if (status === "recusado") return "Pagamento recusado";
  if (status === "cancelado") return "Cancelado";
  if (status === "pausado") return "Pausado";
  return "Não informado";
}

function varianteStatus(status: SituacaoComercialDaAssinatura | null) {
  if (status === "ativo") return "success" as const;
  if (status === "teste") return "info" as const;
  if (status === "recusado") return "warning" as const;
  if (status === "cancelado" || status === "pausado") return "error" as const;
  return "neutral" as const;
}

const TITULO_DO_ACESSO: Record<AccessDecisionReason, string> = {
  platform_admin: "Acesso de administrador da plataforma",
  enforcement_disabled: "Acesso mantido pela plataforma",
  billing_check_unavailable: "Acesso mantido temporariamente",
  trial_active: "Teste ativo",
  trial_expired: "Acesso bloqueado",
  subscription_active: "Assinatura em dia",
  grace_period: "Pagamento pendente",
  subscription_expired: "Acesso bloqueado",
  paused: "Acesso bloqueado",
  legacy_unreviewed: "Assinatura aguardando conferência",
  invalid_billing_data: "Situação da assinatura indisponível",
  unknown_status: "Situação da assinatura indisponível",
};

const DESCRICAO_DO_ACESSO: Record<AccessDecisionReason, string> = {
  platform_admin: "Administradores da plataforma mantêm acesso para operar o serviço.",
  enforcement_disabled: "A cobrança ainda não está aplicando bloqueios nesta instalação.",
  billing_check_unavailable: "Não foi possível verificar a cobrança agora. Você pode continuar trabalhando; a plataforma já foi avisada.",
  trial_active: "Todos os recursos do plano Completo estão liberados durante o teste.",
  trial_expired: "O período de teste terminou. Escolha um plano para continuar usando o produto.",
  subscription_active: "O pagamento está confirmado e o acesso segue liberado.",
  grace_period: "O período pago terminou, mas o acesso continua durante a tolerância.",
  subscription_expired: "O período pago e a tolerância terminaram. Escolha um plano para regularizar.",
  paused: "A assinatura foi pausada pela plataforma. Fale com o suporte para regularizar.",
  legacy_unreviewed: "Esta assinatura existente ainda precisa de conferência pela plataforma.",
  invalid_billing_data: "Não foi possível confirmar os dados comerciais agora. Tente novamente mais tarde.",
  unknown_status: "A plataforma precisa revisar a situação desta assinatura.",
};

function formatarData(valor: string | null, idioma: Idioma): string {
  if (!valor) return traduzir("Não informado", idioma);
  const data = new Date(valor);
  if (!Number.isFinite(data.getTime())) return traduzir("Não informado", idioma);
  return new Intl.DateTimeFormat(idioma, { dateStyle: "long", timeZone: "America/Sao_Paulo" }).format(data);
}

function limite(quantidade: number | null, singular: string, plural: string, idioma: Idioma) {
  if (quantidade === null) return traduzir("Sem limite", idioma);
  return `${quantidade} ${traduzir(quantidade === 1 ? singular : plural, idioma)}`;
}

export function BillingClient({ idioma, assinatura, acesso, podeComprar, checkouts }: BillingClientProps) {
  const t = (texto: string) => traduzir(texto, idioma);
  const planoAtual = assinatura.plan_id ? PLANOS[assinatura.plan_id] : null;

  return (
    <div data-testid="billing-page" className="min-w-0 space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-accent-700 dark:text-accent-300">
          <CreditCard size={20} aria-hidden />
          <span className="text-xs font-medium tracking-[0.12em] uppercase">{t("Assinatura")}</span>
        </div>
        <h1 className="text-2xl font-medium tracking-tight text-text">{t("Plano e pagamentos")}</h1>
        <p className="max-w-2xl text-sm text-text-muted">
          {t("Veja o plano da sua empresa, a validade do acesso e as opções para contratar ou trocar.")}
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.75fr)]">
        <Card className="border border-border">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardDescription>{t("Plano atual")}</CardDescription>
                <CardTitle className="mt-1">{planoAtual?.nome ?? t("Sem plano registrado")}</CardTitle>
              </div>
              <Badge variant={varianteStatus(assinatura.status)}>{t(rotuloStatus(assinatura.status))}</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-text-muted">{t("Acesso até")}</p>
              <p className="mt-1 text-sm font-medium text-text">{formatarData(assinatura.access_until ?? acesso.accessUntil, idioma)}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">{t("Período pago até")}</p>
              <p className="mt-1 text-sm font-medium text-text">{formatarData(assinatura.paid_through, idioma)}</p>
            </div>
            {planoAtual && (
              <ul className="col-span-full grid gap-2 text-sm text-text-muted sm:grid-cols-2" aria-label={t("Limites do plano atual")}>
                <li>{limite(planoAtual.limites.numerosWhatsapp, "WhatsApp", "WhatsApps", idioma)}</li>
                <li>{limite(planoAtual.limites.funcionariosIa, "atendente de IA", "atendentes de IA", idioma)}</li>
                <li>{limite(planoAtual.limites.usuarios, "pessoa da equipe", "pessoas da equipe", idioma)}</li>
                <li>{limite(planoAtual.limites.funis, "funil de vendas", "funis de vendas", idioma)}</li>
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className={acesso.allowed ? "border border-border" : "border border-error"}>
          <CardHeader>
            <div className="flex items-center gap-2">
              {acesso.allowed ? <CheckCircle size={20} className="text-success-fg" aria-hidden /> : <Warning size={20} className="text-error-fg" aria-hidden />}
              <CardTitle>{t(TITULO_DO_ACESSO[acesso.reason])}</CardTitle>
            </div>
            <CardDescription>{t(DESCRICAO_DO_ACESSO[acesso.reason])}</CardDescription>
          </CardHeader>
          {acesso.accessUntil && (
            <CardContent className="flex items-center gap-2 text-sm text-text-muted">
              <CalendarBlank size={18} aria-hidden />
              <span>{t("Data limite")}: {formatarData(acesso.accessUntil, idioma)}</span>
            </CardContent>
          )}
        </Card>
      </section>

      <section aria-labelledby="billing-plans-title" className="space-y-4">
        <div>
          <h2 id="billing-plans-title" className="text-[17px] font-medium text-text">{t("Escolha o plano do tamanho do seu negócio")}</h2>
          <p className="mt-1 text-sm text-text-muted">{t("A compra é concluída com segurança no checkout da Monetizze.")}</p>
          {!podeComprar && (
            <p role="status" className="mt-2 text-sm text-text-muted">
              {t("Peça a um administrador da empresa para contratar ou trocar o plano.")}
            </p>
          )}
        </div>
        <div data-testid="billing-plan-grid" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {PLANOS_IDS.map((planoId) => {
            const plano = PLANOS[planoId];
            const checkout = checkouts[planoId];
            const atual = assinatura.plan_id === planoId;
            return (
              <Card key={planoId} className={atual ? "border border-accent" : "border border-border"}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>{plano.nome}</CardTitle>
                    {atual && <Badge>{t("Plano atual")}</Badge>}
                  </div>
                  <p className="text-2xl font-medium text-text">{formatarPrecoMensal(plano.precoMensalCents)}<span className="text-sm font-normal text-text-muted">/{t("mês")}</span></p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-1.5 text-sm text-text-muted">
                    <li>{limite(plano.limites.numerosWhatsapp, "WhatsApp", "WhatsApps", idioma)}</li>
                    <li>{limite(plano.limites.funcionariosIa, "atendente de IA", "atendentes de IA", idioma)}</li>
                    <li>{limite(plano.limites.usuarios, "pessoa da equipe", "pessoas da equipe", idioma)}</li>
                    <li>{limite(plano.limites.funis, "funil de vendas", "funis de vendas", idioma)}</li>
                  </ul>
                  {!podeComprar ? null : checkout ? (
                    <Button asChild className="w-full">
                      <a href={checkout} target="_blank" rel="noreferrer noopener" aria-label={`${t("Escolher")} ${plano.nome}`}>
                        {t("Escolher plano")}
                        <ArrowSquareOut aria-hidden />
                      </a>
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <Button className="w-full" disabled aria-label={`${t("Checkout do plano")} ${plano.nome} ${t("indisponível")}`}>
                        {t("Checkout indisponível")}
                      </Button>
                      <p className="text-xs text-text-muted">{t("Compra indisponível nesta instalação")}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
