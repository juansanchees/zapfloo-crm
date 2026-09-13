"use client";

import { useT } from "@/hooks/i18n/useT";
/**
 * EDITAR O CONTEÚDO DE UM MATERIAL.
 *
 * Este botão existia e era decorativo: `toast.info("Editor de FAQ em breve.")`
 * sobre um `PATCH` que já funcionava. Controle que não controla nada é pior que
 * controle ausente, porque gasta a confiança de quem clicou.
 *
 * O diálogo CARREGA o que já está lá antes de deixar editar. Sem isso, "editar"
 * abriria um campo vazio e salvar apagaria o material inteiro — o pior desfecho
 * possível para um botão com esse nome.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { parseFaqMarkdown } from "@/lib/ai/rag/ingest/faq";

interface ItemDaFaq {
  question: string;
  answer: string;
  tags: string[];
  locale: string;
}

interface Props {
  sourceId: string;
  nome: string;
  aberto: boolean;
  onFechar: () => void;
  onSalvo: () => void;
  /** Material lido do site requer uma conferência explícita antes do primeiro uso. */
  confirmarSite?: boolean;
}

function paraMarkdown(itens: ItemDaFaq[]): string {
  return itens.map((i) => `## Pergunta: ${i.question}\n## Resposta: ${i.answer}`).join("\n\n");
}

export function EditarFaqDialog({
  sourceId,
  nome,
  aberto,
  onFechar,
  onSalvo,
  confirmarSite = false,
}: Props) {
  const t = useT();
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [conferido, setConferido] = useState(false);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    setCarregando(true);
    setCarregado(false);
    setConferido(false);
    apiClient
      .get<{ data: { items: ItemDaFaq[] } }>(`/api/v1/ai/knowledge/sources/${sourceId}`)
      .then((res) => {
        if (!vivo) return;
        setTexto(paraMarkdown(res.data.items ?? []));
        setCarregado(true);
      })
      .catch((err) => {
        if (vivo) showApiError(err);
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [aberto, sourceId]);

  async function salvar(): Promise<void> {
    if (!carregado || (confirmarSite && !conferido)) return;
    const itens = parseFaqMarkdown(texto);
    if (itens.length === 0) {
      // `## Pergunta:`/`## Resposta:` NÃO entram na tradução: são os marcadores
      // que `lib/ai/rag/ingest/faq.ts` casa por regex de língua fixa. Traduzi-los
      // faria a instrução ensinar um formato que o parser recusa.
      toast.error(
        t("Não achei nenhum par pergunta/resposta. Use uma linha") +
          " ## Pergunta: " +
          t("e uma") +
          " ## Resposta: " +
          t("por item."),
      );
      return;
    }
    setSalvando(true);
    try {
      await apiClient.patch(`/api/v1/ai/knowledge/sources/${sourceId}`, {
        items: itens,
        ...(confirmarSite ? { confirmar_site: true } : {}),
      });
      toast.success(t("Conteúdo salvo. Estou preparando de novo — leva alguns instantes."));
      onSalvo();
      onFechar();
    } catch (err) {
      showApiError(err);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("Editar")} “{nome}”
          </DialogTitle>
          <DialogDescription>
            {confirmarSite
              ? t(
                  "Confira cada resposta antes de permitir que o agente use este material. Os preços dos produtos são confirmados separadamente no catálogo.",
                )
              : t(
                  "O que você salvar aqui substitui o conteúdo atual, e o agente é preparado de novo.",
                )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-2 overflow-y-auto pr-1">
          <Label htmlFor="faq-texto">{t("Conteúdo")}</Label>
          <Textarea
            id="faq-texto"
            data-testid="faq-editar-texto"
            rows={14}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setConferido(false);
            }}
            disabled={carregando || salvando}
          />
          <p className="text-xs text-text-muted">
            {t("Uma linha")} <code>## Pergunta:</code> {t("e uma")} <code>## Resposta:</code>{" "}
            {t("por item, separados por uma linha em branco.")}
          </p>
          {confirmarSite ? (
            <label className="flex items-start gap-2 text-sm" htmlFor="faq-site-conferido">
              <input
                id="faq-site-conferido"
                type="checkbox"
                checked={conferido}
                onChange={(event) => setConferido(event.target.checked)}
                disabled={carregando || salvando || !carregado}
                className="mt-1"
              />
              <span>{t("Conferi as perguntas e respostas e autorizo o uso pelo agente.")}</span>
            </label>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>
            {t("Cancelar")}
          </Button>
          <Button
            onClick={salvar}
            disabled={carregando || salvando || !carregado || (confirmarSite && !conferido)}
            data-testid="faq-editar-salvar"
          >
            {salvando
              ? t("Salvando…")
              : confirmarSite
                ? t("Confirmar perguntas")
                : t("Salvar conteúdo")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
