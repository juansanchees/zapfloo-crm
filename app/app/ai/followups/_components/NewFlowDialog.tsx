"use client";

import { useT } from "@/hooks/i18n/useT";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateFollowupFlow, useGenerateFollowupFlow } from "@/hooks/followup/useFollowupFlows";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewFlowDialog({ open, onOpenChange }: Props) {
  const t = useT();
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [description, setDescription] = useState("");
  const create = useCreateFollowupFlow();
  const generate = useGenerateFollowupFlow();

  const [erro, setErro] = useState<string | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    const callbacks = {
      onSuccess: () => {
        setName("");
        setDescription("");
        setErro(null);
        onOpenChange(false);
      },
      // Sem isto o POST podia falhar e o diálogo ficava lá, parado, sem dizer
      // nada: o usuário clica "Criar fluxo" de novo achando que não pegou. O
      // erro fica DENTRO do diálogo (não num toast que some) porque é ali que
      // ele está olhando, e o diálogo NÃO fecha — fechar apagaria o nome digitado.
      onError: (err: unknown) => {
        setErro(
          err instanceof Error && err.message
            ? t(err.message)
            : t("Não consegui criar o fluxo. Tente de novo."),
        );
      },
    };

    if (mode === "ai") {
      generate.mutate(
        { name: name.trim(), description: description.trim() },
        callbacks,
      );
      return;
    }

    create.mutate(name.trim(), callbacks);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setName("");
          setDescription("");
          setErro(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Novo fluxo de follow-up")}</DialogTitle>
          <DialogDescription>
            {t("Crie manualmente ou descreva o que precisa. A IA monta um rascunho para você revisar antes de publicar.")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("Como deseja começar?")}</Label>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("Modo de criação")}>
              <Button
                type="button"
                variant={mode === "ai" ? "default" : "outline"}
                onClick={() => setMode("ai")}
              >
                {t("Criar com IA")}
              </Button>
              <Button
                type="button"
                variant={mode === "manual" ? "default" : "outline"}
                onClick={() => setMode("manual")}
              >
                {t("Criar manualmente")}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="flow-name">Nome</Label>
            <Input
              id="flow-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("Ex: Recuperação de carrinho abandonado")}
              maxLength={80}
              required
              autoFocus
            />
          </div>
          {mode === "ai" && (
            <div className="space-y-2">
              <Label htmlFor="flow-description">{t("Descreva o fluxo")}</Label>
              <Textarea
                id="flow-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("Ex: depois de 30 minutos, envie uma mensagem. Se o cliente responder que tem interesse, marque como convertido; se não responder em 24 horas, encerre.")}
                maxLength={2000}
                rows={5}
                required
              />
              <p className="text-xs text-text-muted">
                {t("A plataforma usa apenas blocos e operadores compatíveis. Nada entra no ar sem sua revisão.")}
              </p>
            </div>
          )}
          {erro && (
            <p role="alert" data-testid="new-flow-error" className="text-sm text-error-fg">
              {erro}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={create.isPending || generate.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                create.isPending || generate.isPending || name.trim().length === 0 ||
                (mode === "ai" && description.trim().length < 20)
              }
            >
              {create.isPending || generate.isPending
                ? t("Criando…")
                : mode === "ai"
                  ? t("Gerar rascunho")
                  : t("Criar fluxo")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
