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
export interface CanalParaTeste { id: string; name: string; status: string; mode: AiAccessMode; count: number }
interface Props { reference: z.input<typeof confirmarAgenteRevisadoSchema>; channels: CanalParaTeste[] }
export function AutorizacaoRestrita({ reference, channels }: Props) {
  const t = useT(); const router = useRouter();
  const [channelId, setChannelId] = useState("");
  const [saved, setSaved] = useState<{ channelId: string; mode: AiAccessMode; count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activated, setActivated] = useState(false);
  const [pending, startTransition] = useTransition();
  const channel = channels.find(c => c.id === channelId);
  const access = saved?.channelId === channelId ? saved : channel;
  const ready = channel?.status === "WORKING" && channel.mode === "pre_go_live" && access?.mode === "pre_go_live" && access.count > 0;
  return <section aria-labelledby="autorizar-teste" className="min-w-0 space-y-4 rounded-xl border border-primary/30 bg-background p-4 sm:p-6">
    <h3 id="autorizar-teste" className="text-lg font-semibold">{t("Autorizar teste restrito")}</h3>
    <p className="text-sm">{t("Conectar não ativa o agente. O último botão habilita respostas reais apenas para os números autorizados; ele não envia nenhuma mensagem.")}</p>
    <div className="space-y-2"><Label htmlFor="canal-teste">{t("Canal para o teste restrito")}</Label>
      <select id="canal-teste" disabled={pending || activated} value={channelId} onChange={e => { setChannelId(e.target.value); setSaved(null); setError(null); }} className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary">
        <option value="">{t("Selecione um canal conectado")}</option>
        {channels.map(c => <option key={c.id} value={c.id}>{c.name} · {t(c.status === "WORKING" ? "Conectado" : "Aguardando conexão")}</option>)}
      </select>
    </div>
    {channels.length === 0 && <p className="text-sm text-muted-foreground">{t("Conecte um canal e clique em Conferir canais conectados.")}</p>}
    {channel && channel.mode !== "pre_go_live" && <p role="alert" className="text-sm">{t("Este canal já tem outra política de atendimento. Escolha um canal em modo de teste; a configuração existente será preservada.")}</p>}
    {channel?.mode === "pre_go_live" && !activated && <ChannelAiAccess key={channelId} channelId={channelId} restrictedOnly requireAtLeastOne onSaved={setSaved} />}
    <Button type="button" className="h-auto min-h-10 whitespace-normal" disabled={!ready || pending || Boolean(error) || activated} onClick={() => startTransition(async () => {
      setError(null);
      try {
        const result = await ativarAgenteParaTeste({ ...reference, channel_session_id: channelId });
        if (!result.ok) {
          setError(result.error === "draft_conflict" || result.error === "draft_context_changed" || result.error === "rehearsal_conflict"
            ? "Revise novamente o agente: a configuração ou organização mudou."
            : "Não foi possível ativar. Confira a revisão, a conexão e os números autorizados antes de tentar novamente.");
          return;
        }
        setActivated(true); router.refresh();
      } catch { setError("Não foi possível confirmar a ativação. Recarregue para conferir antes de tentar novamente."); }
    })}>{t(pending ? "Ativando…" : "Ativar para estes números de teste")}</Button>
    {activated && <p role="status">{t("Agente ativado somente para os números de teste. Nenhuma mensagem foi enviada.")}</p>}
    {error && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{t(error)}</p><Button variant="outline" onClick={() => { setError(null); router.refresh(); }}>{t("Conferir estado atual")}</Button></div>}
    <Link href="/onboarding/setup-ai" className="block text-sm underline underline-offset-4">{t("Voltar ao agente")}</Link>
  </section>;
}
