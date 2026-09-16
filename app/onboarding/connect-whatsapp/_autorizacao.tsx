"use client";
import type { z } from "zod";
import type { confirmarAgenteRevisadoSchema } from "@/lib/onboarding/concluir";
import type { AiAccessMode } from "@/lib/ai/elegibilidade/pre-go-live";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ChannelAiAccess } from "@/components/connections/ChannelAiAccess";
import { ativarAgenteParaTeste } from "@/app/actions/onboarding/concluir";
import { apiClient } from "@/lib/api/client";
export interface CanalParaTeste { id: string; name: string; status: string; mode: AiAccessMode; count: number }
interface Props { reference: z.input<typeof confirmarAgenteRevisadoSchema>; channels: CanalParaTeste[] }
export function AutorizacaoRestrita({ reference, channels }: Props) {
  const t = useT(); const router = useRouter();
  const [channelId, setChannelId] = useState("");
  const [saved, setSaved] = useState<{ channelId: string; mode: AiAccessMode; count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activated, setActivated] = useState(false);
  const [publico, setPublico] = useState(false);
  const [escolha, setEscolha] = useState<"teste" | "todos" | null>(null);
  const [pending, startTransition] = useTransition();
  const channel = channels.find(c => c.id === channelId);
  const access = saved?.channelId === channelId ? saved : channel;
  const ready = channel?.status === "WORKING" && channel.mode === "pre_go_live" && access?.mode === "pre_go_live" && access.count > 0;
  async function liberarParaTodos(): Promise<boolean> {
    setError(null);
    try {
      await apiClient.patch(`/api/v1/channel-sessions/${channelId}/ai-access`, {
        mode: "open",
        test_phone_numbers: [],
      });
      setPublico(true);
      router.refresh();
      return true;
    } catch {
      setError("O agente foi ativado em modo de teste, mas não foi possível liberar para todos. Tente novamente pelo botão abaixo.");
      return false;
    }
  }
  return <section aria-labelledby="autorizar-teste" className="min-w-0 space-y-4 rounded-xl border border-primary/30 bg-background p-4 sm:p-6">
    <h3 id="autorizar-teste" className="text-lg font-semibold">{t("Escolha quem a IA vai atender")}</h3>
    <p className="text-sm">{t("Conectar não ativa o agente. Você decide o alcance antes da primeira resposta automática.")}</p>
    <div className="grid gap-3 sm:grid-cols-2" aria-label={t("Alcance inicial da IA")}>
      <button type="button" aria-pressed={escolha === "teste"} onClick={() => setEscolha("teste")} className={`rounded-lg border p-4 text-left ${escolha === "teste" ? "border-primary bg-primary/5" : "border-border bg-surface"}`}>
        <strong className="block text-sm">{t("Atender só os meus números de teste")}</strong>
        <span className="mt-1 block text-xs text-muted-foreground">{t("Clientes continuam chegando ao Inbox, mas só os números autorizados recebem resposta da IA.")}</span>
      </button>
      <button type="button" aria-pressed={escolha === "todos"} onClick={() => setEscolha("todos")} className={`rounded-lg border p-4 text-left ${escolha === "todos" ? "border-primary bg-primary/5" : "border-border bg-surface"}`}>
        <strong className="block text-sm">{t("Atender todos os clientes")}</strong>
        <span className="mt-1 block text-xs text-muted-foreground">{t("Depois da ativação, toda mensagem nova elegível poderá receber resposta da IA.")}</span>
      </button>
    </div>
    <div className="space-y-2"><Label htmlFor="canal-teste">{t("Canal que a IA vai atender")}</Label>
      <select id="canal-teste" disabled={pending || activated} value={channelId} onChange={e => { setChannelId(e.target.value); setSaved(null); setError(null); }} className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary">
        <option value="">{t("Selecione um canal conectado")}</option>
        {channels.map(c => <option key={c.id} value={c.id}>{c.name} · {t(c.status === "WORKING" ? "Conectado" : "Aguardando conexão")}</option>)}
      </select>
    </div>
    {channels.length === 0 && <p className="text-sm text-muted-foreground">{t("Conecte um canal e clique em Conferir canais conectados.")}</p>}
    {channel && channel.mode !== "pre_go_live" && <p role="alert" className="text-sm">{t("Este canal já tem outra política de atendimento. Escolha um canal em modo de teste; a configuração existente será preservada.")}</p>}
    {channel?.mode === "pre_go_live" && !activated && <ChannelAiAccess key={channelId} channelId={channelId} restrictedOnly requireAtLeastOne onSaved={setSaved} />}
    <Button type="button" className="h-auto min-h-10 whitespace-normal" disabled={!ready || !escolha || pending || Boolean(error) || activated} onClick={() => startTransition(async () => {
      setError(null);
      try {
        const result = await ativarAgenteParaTeste({ ...reference, channel_session_id: channelId });
        if (!result.ok) {
          setError(result.error === "draft_conflict" || result.error === "draft_context_changed" || result.error === "rehearsal_conflict"
            ? "Revise novamente o agente: a configuração ou organização mudou."
            : "Não foi possível ativar. Confira a revisão, a conexão e os números autorizados antes de tentar novamente.");
          return;
        }
        setActivated(true);
        if (escolha === "todos") await liberarParaTodos();
        else router.refresh();
      } catch { setError("Não foi possível confirmar a ativação. Recarregue para conferir antes de tentar novamente."); }
    })}>{t(pending ? "Ativando…" : escolha === "todos" ? "Ativar e atender todos" : "Ativar para estes números de teste")}</Button>
    {activated && <div className="space-y-2">
      <p role="status">{t(publico ? "Agente ativado para todos os clientes. Mensagens antigas não serão respondidas." : "Agente ativado somente para os números de teste. Nenhuma mensagem foi enviada.")}</p>
      {!publico && <Button type="button" variant="outline" onClick={() => void liberarParaTodos()}>{t("Liberar para todos agora")}</Button>}
    </div>}
    {error && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{t(error)}</p><Button variant="outline" onClick={() => { setError(null); router.refresh(); }}>{t("Conferir estado atual")}</Button></div>}
    <Link href="/onboarding/setup-ai" className="block text-sm underline underline-offset-4">{t("Voltar ao agente")}</Link>
  </section>;
}
