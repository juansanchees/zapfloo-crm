"use client";

import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";

import { useT } from "@/hooks/i18n/useT";
/**
 * UM MATERIAL DO ACERVO.
 *
 * Antes isto era um "slot": quatro cartões fixos, um por categoria, presos ao
 * agente padrão da organização. Dois dos quatro botões eram decorativos —
 * "Editar conteúdo" e "Upload novo arquivo" abriam um `toast.info("em breve")`
 * sobre uma API que já existia e nunca foi ligada à tela.
 *
 * Agora cada cartão é um material de verdade, com as ações que ele aceita: ver
 * o que o agente aprendeu, editar (quando é texto colado), preparar de novo, e
 * arquivar. O que o cartão NÃO oferece é o que aquele tipo de material não
 * aceita — controle que não controla nada gasta a confiança de quem clicou.
 */
import { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  FileText,
  HelpCircle,
  MessageSquare,
  Package,
  RefreshCw,
  Trash2,
  Globe,
} from "lucide-react";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import {
  lerEstadoDoSite,
  revisaoDoSiteExpirou,
  siteFoiRevisado,
} from "@/lib/onboarding/site/estado";
import { mensagemDoSite } from "@/lib/onboarding/site/mensagens";
import { SourceStatusBadge, deriveBadgeStatus } from "@/components/ai/SourceStatusBadge";
import { TrechosDoMaterialDialog } from "@/components/ai/TrechosDoMaterialDialog";
import { EditarFaqDialog } from "@/components/ai/EditarFaqDialog";
import {
  TIPO_DE_FONTE_POR_ID,
  canonizarTipoDeFonte,
  aceitaTextoColado,
} from "@/lib/ai/rag/tipos-de-fonte";
import type { SourceRow } from "@/hooks/ai/useKnowledgeSources";

const ICONE_POR_TIPO: Record<string, typeof HelpCircle> = {
  faq: HelpCircle,
  documento: FileText,
  conversas: MessageSquare,
  catalogo: Package,
  site: Globe,
};

interface Props {
  source: SourceRow;
  /** Nomes dos assistentes que consultam este material. */
  usadoPor: string[];
  onReindex: () => void;
  onArquivar: () => void;
  onMudou: () => void;
  isReindexing?: boolean;
}

function formatRelative(
  iso: string | null,
  tagDoIdioma: string,
  t: (texto: string) => string = (texto) => texto,
): string {
  if (!iso) return t("nunca");
  const then = new Date(iso).getTime();
  const diffSec = Math.floor((Date.now() - then) / 1000);
  if (diffSec < 60) return t("agora há pouco");
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `há ${diffHr} h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `há ${diffDay} d`;
  return new Date(iso).toLocaleDateString(tagDoIdioma);
}

export function KnowledgeSourceCard({
  source,
  usadoPor,
  onReindex,
  onArquivar,
  onMudou,
  isReindexing,
}: Props) {
  const t = useT();
  const tagDoIdioma = useTagDeIdioma();
  const [vendoTrechos, setVendoTrechos] = useState(false);
  const [editando, setEditando] = useState(false);
  const [relendo, setRelendo] = useState(false);

  const tipo = canonizarTipoDeFonte(source.source_type) ?? "faq";
  const meta = TIPO_DE_FONTE_POR_ID.get(tipo);
  const Icon = ICONE_POR_TIPO[tipo] ?? BookOpen;

  const derived = deriveBadgeStatus(source);
  const arquivado = derived === "archived";
  const mostraErro =
    (derived === "failed" || derived === "sem_credencial") && source.last_index_error;
  const temTrechos = (source.chunks_count ?? 0) > 0;
  const site = tipo === "site" ? lerEstadoDoSite(source.source_metadata) : null;
  const aguardaRevisao =
    tipo === "site" &&
    !arquivado &&
    (!source.is_active || !siteFoiRevisado(source.source_metadata));
  const revisaoExpirada = revisaoDoSiteExpirou(site);
  const lendoSite = tipo === "site" && source.status === "building" && !site?.revisaoToken;
  const revisandoSite =
    tipo === "site" &&
    source.status === "building" &&
    Boolean(site?.revisaoToken) &&
    !revisaoExpirada;
  const falhouLeitura = tipo === "site" && source.status === "failed";
  const temPerguntasSite = Boolean(site && site.perguntas !== 0);
  const erroDoSite = tipo === "site"
    ? (source.last_index_error ?? site?.motivo ?? (!site ? "site_estado_invalido" : null))
    : null;

  async function relerSite(): Promise<void> {
    setRelendo(true);
    try {
      await apiClient.post("/api/v1/onboarding/site/retry", { source_id: source.id });
      onMudou();
    } catch (err) {
      showApiError(err);
    } finally {
      setRelendo(false);
    }
  }

  return (
    <Card className="flex h-full flex-col" data-testid={`material-${source.id}`}>
      <CardHeader>
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <Icon className="h-5 w-5 shrink-0 text-accent" aria-hidden />
            <CardTitle className="min-w-0 break-words text-base">{source.name}</CardTitle>
          </div>
          {tipo === "site" && !site ? <Badge variant="error">{t("Não entrou")}</Badge> : aguardaRevisao && !falhouLeitura ? (
            <Badge variant={lendoSite || revisandoSite ? "info" : "warning"}>
              {lendoSite
                ? t("Lendo o seu site…")
                : revisandoSite
                  ? t("Salvando…")
                  : temPerguntasSite
                    ? t("Aguardando sua conferência")
                    : t("Leitura concluída")}
            </Badge>
          ) : (
            <SourceStatusBadge source={source} />
          )}
        </div>
        <p className="text-sm text-text-muted">
          {meta?.rotulo ? t(meta.rotulo) : source.source_type}
        </p>
      </CardHeader>

      <CardContent className="flex-1 space-y-2 text-sm">
        {site ? (
          <div className="space-y-2" data-testid={`material-site-${source.id}`}>
            <p className="break-all text-text-muted">{site.url}</p>
            {aguardaRevisao && temPerguntasSite && !lendoSite && !falhouLeitura ? (
              <p className="text-warning-fg">
                {t(
                  "As perguntas do site ainda não são usadas pelo agente. Confira o conteúdo antes de confirmar.",
                )}
              </p>
            ) : null}
            {!temPerguntasSite && !lendoSite && !falhouLeitura ? (
              <p className="text-text-muted">
                {t(
                  "Não encontrei perguntas frequentes neste site. Você pode adicionar outro material manualmente.",
                )}
              </p>
            ) : null}
            {site.limiteAtingido ? (
              <p className="text-text-muted">
                {t(
                  "Li até o limite de páginas desta leitura. Você pode completar o conteúdo na revisão.",
                )}
              </p>
            ) : null}
            {site.recusas.length > 0 ? (
              <details className="rounded-md border border-border p-2 text-xs">
                <summary className="cursor-pointer font-medium">{t("O que não importei")}</summary>
                <ul className="mt-2 space-y-2">
                  {site.recusas.map((recusa, index) => (
                    <li key={`${recusa.url}-${recusa.linha}-${index}`} className="break-words">
                      <span className="break-all">{recusa.url}</span>
                      {" · "}
                      {t("Linha")} {recusa.linha}
                      {": "}
                      {recusa.item ? (
                        <span>
                          {recusa.item}
                          {" — "}
                        </span>
                      ) : null}
                      {t(mensagemDoSite(recusa.motivo))}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}
        {erroDoSite ? (
          <p
            role="status"
            className="rounded-md border border-error-bg bg-error-bg/30 p-2 text-xs text-error-fg"
          >
            {t(mensagemDoSite(erroDoSite))}
          </p>
        ) : null}
        <div className="flex items-baseline justify-between">
          <span className="text-text-muted">{t("Preparado")}</span>
          <span>{formatRelative(source.last_indexed_at, tagDoIdioma, t)}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-text-muted">{t("Trechos que o agente encontra")}</span>
          <span data-testid={`material-trechos-${source.id}`}>{source.chunks_count ?? 0}</span>
        </div>

        {/* Quem usa este material. Sem isto, arquivar é um tiro no escuro: não dá
            para saber quantos assistentes param de saber daquilo. */}
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-text-muted">{t("Consultado por")}</span>
          <span className="text-right">
            {usadoPor.length === 0 ? (
              <span className="text-warning-fg" data-testid={`material-orfao-${source.id}`}>
                {t("nenhum assistente ainda")}
              </span>
            ) : (
              usadoPor.join(", ")
            )}
          </span>
        </div>

        {mostraErro && tipo !== "site" ? (
          <details className="rounded-md border border-error-bg bg-error-bg/30 p-2 text-xs text-error-fg">
            <summary className="cursor-pointer font-medium">{t("Por que não entrou")}</summary>
            <p className="mt-1 break-words whitespace-pre-wrap">{source.last_index_error}</p>
          </details>
        ) : null}
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2">
        {!aguardaRevisao ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={arquivado || isReindexing}
            onClick={onReindex}
            data-testid={`material-reindexar-${source.id}`}
          >
            <RefreshCw
              className={`mr-2 h-3.5 w-3.5 ${isReindexing ? "animate-spin" : ""}`}
              aria-hidden
            />
            {isReindexing ? t("Preparando…") : t("Preparar de novo")}
          </Button>
        ) : null}
        {falhouLeitura && site && site.tentativas < 3 ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={relendo}
            onClick={relerSite}
            data-testid={`material-reler-site-${source.id}`}
          >
            {relendo ? t("Solicitando nova leitura…") : t("Tentar ler o site de novo")}
          </Button>
        ) : null}
        {falhouLeitura && site && site.tentativas >= 3 ? (
          <p className="text-xs text-text-muted">
            {t(
              "Não consegui ler este site após três tentativas. Você pode adicionar o conteúdo manualmente em outro material.",
            )}
          </p>
        ) : null}
        {tipo === "site" ? (
          <Button variant="ghost" size="sm" asChild>
            <Link href="/app/products">{t("Conferir produtos")}</Link>
          </Button>
        ) : null}

        {temTrechos ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setVendoTrechos(true)}
              data-testid={`material-ver-${source.id}`}
            >
              {t("Ver o que ele aprendeu")}
            </Button>
            {/* Montado só quando aberto: o diálogo faz `useQuery`, e mantê-lo
                no ar fechado custa um observer por cartão numa tela que lista
                dezenas deles. */}
            {vendoTrechos ? (
              <TrechosDoMaterialDialog
                sourceId={source.id}
                nome={source.name}
                aberto
                onFechar={() => setVendoTrechos(false)}
              />
            ) : null}
          </>
        ) : null}

        {aceitaTextoColado(tipo) &&
        !arquivado &&
        !lendoSite &&
        !revisandoSite &&
        !falhouLeitura &&
        (tipo !== "site" || temPerguntasSite) ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditando(true)}
              data-testid={`material-editar-${source.id}`}
            >
              {tipo === "site" ? t("Revisar perguntas") : t("Editar conteúdo")}
            </Button>
            {editando ? (
              <EditarFaqDialog
                sourceId={source.id}
                nome={source.name}
                aberto
                onFechar={() => setEditando(false)}
                onSalvo={onMudou}
                confirmarSite={tipo === "site"}
              />
            ) : null}
          </>
        ) : null}

        {!arquivado ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onArquivar}
            data-testid={`material-arquivar-${source.id}`}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" aria-hidden />
            {t("Arquivar")}
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}
