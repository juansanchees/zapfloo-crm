"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { useT } from "@/hooks/i18n/useT";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface StatusDaIa {
  ativo: boolean;
  estado: "atendendo_todos" | "em_teste" | "desligada";
  motivo: "nenhum_agente_publicado" | "whatsapp_desconectado" | "saldo_da_plataforma" | null;
  numeros_autorizados: number;
  canal_id: string | null;
}

function motivoEmTexto(motivo: StatusDaIa["motivo"]): string {
  if (motivo === "nenhum_agente_publicado") return "nenhum agente publicado";
  if (motivo === "whatsapp_desconectado") return "WhatsApp desconectado";
  if (motivo === "saldo_da_plataforma") return "a IA está indisponível no momento; já avisamos o suporte";
  return "estado indisponível";
}

export function AiServiceStatus({ canConfigure = false }: { canConfigure?: boolean }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["ai-service-status"],
    queryFn: () => apiClient.get<{ data: StatusDaIa }>("/api/v1/ai/automatico-ativo").then((r) => r.data),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  if (query.isLoading) return <p role="status" className="text-sm text-muted-foreground">{t("Carregando estado da IA…")}</p>;
  if (query.isError || !query.data) return <p role="alert" className="text-sm text-destructive">{t("Não foi possível confirmar se a IA está atendendo.")}</p>;
  const status = query.data;
  const titulo = status.estado === "atendendo_todos"
    ? t("IA atendendo todos")
    : status.estado === "em_teste"
      ? `${t("IA em teste")} — ${status.numeros_autorizados} ${t(status.numeros_autorizados === 1 ? "número autorizado" : "números autorizados")}`
      : `${t("IA desligada")} — ${t(motivoEmTexto(status.motivo))}`;

  async function liberar() {
    if (!status.canal_id) return;
    setBusy(true); setError(null);
    try {
      await apiClient.patch(`/api/v1/channel-sessions/${status.canal_id}/ai-access`, { mode: "open", test_phone_numbers: [] });
      await queryClient.invalidateQueries({ queryKey: ["ai-service-status"] });
      setConfirmOpen(false);
    } catch {
      setError(t("Não foi possível liberar a IA. Abra Conexões e confira o canal."));
    } finally { setBusy(false); }
  }

  return <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" aria-label={t("Estado do atendimento por IA")}>
    <div className="space-y-1">
      <Badge variant={status.estado === "atendendo_todos" ? "neutral" : status.estado === "em_teste" ? "warning" : "destructive"}>{titulo}</Badge>
      {status.estado === "em_teste" && <p className="text-sm text-muted-foreground">{t("Fora da lista autorizada, as mensagens chegam ao Inbox sem resposta automática.")}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
    {canConfigure && status.estado === "em_teste" && <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => setConfirmOpen(true)}>{t("Liberar para todos")}</Button>
      <Button size="sm" variant="outline" asChild><Link href="/app/connections">{t("Autorizar números")}</Link></Button>
    </div>}
    {canConfigure && status.estado === "desligada" && status.motivo !== "saldo_da_plataforma" && <Button size="sm" variant="outline" asChild><Link href={status.motivo === "whatsapp_desconectado" ? "/app/connections" : "/app/ai/agents"}>{t("Corrigir agora")}</Link></Button>}
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{t("Liberar a IA para todos?")}</AlertDialogTitle><AlertDialogDescription>{t("A IA poderá responder qualquer pessoa que enviar mensagem nova neste canal. Mensagens antigas não serão respondidas por esta ação.")}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>{t("Cancelar")}</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void liberar(); }}>{t(busy ? "Liberando…" : "Confirmar liberação")}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </Card>;
}
