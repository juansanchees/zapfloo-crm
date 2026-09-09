"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmarAgenteRevisado } from "@/app/actions/onboarding/concluir";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { prepararRascunho } from "@/app/actions/onboarding/prepararRascunho";
import { iniciarEnsaio, revisarEnsaio, lerEnsaio } from "@/app/actions/onboarding/ensaio";
import { ExplorarCrm } from "@/app/onboarding/_components/ExplorarCrm";
import type { LeituraEnsaio, ProvaEnsaio } from "@/lib/onboarding/ensaio";

export function Ensaio({ initial, context, revision, dirty, epoch, onBusy }: {
  initial: LeituraEnsaio; context: string; revision: number; dirty: boolean; epoch: number; onBusy: (busy: boolean) => void;
}) {
  const t = useT();
  const router = useRouter();
  // Fixado junto ao formulário, inclusive numa navegação RSC em outra organização.
  const [panel, setPanel] = useState(initial.ok ? initial.panel : null);
  const [selection, setSelection] = useState(panel?.selection ?? null);
  const [model, setModel] = useState(selection ? `${selection.provider}/${selection.model}` : "");
  const [credential, setCredential] = useState(selection?.credential_id ?? "");
  const [message, setMessage] = useState(panel?.proof?.sample_message ?? "");
  const [proof, setProof] = useState<ProvaEnsaio | null>(panel?.proof ?? null);
  const [proofEpoch, setProofEpoch] = useState(epoch);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initial.ok ? null : "Não foi possível carregar o ensaio. Recarregue a página.");
  const chosen = panel?.models.find(m => `${m.provider}/${m.model_id}` === model);
  const ready = selection && selection.revision === revision && selection.provider === chosen?.provider
    && selection.model === chosen?.model_id && selection.credential_id === (credential || null);
  const current = !dirty && proofEpoch === epoch && proof?.version_id === selection?.version_id && proof?.revision === revision ? proof : null;
  const reviewable = ready && current?.status === "completed" && !current.reviewed;
  const blocked = busy || dirty || revision < 1 || !panel;
  const failure = (code: string) => code === "rehearsal_busy" || code === "rehearsal_rate_limited"
    ? "Há um ensaio em andamento ou muitas tentativas recentes. Aguarde um minuto antes de testar novamente."
    : code === "draft_context_changed" || code === "draft_conflict" || code === "rehearsal_conflict"
    ? "A configuração ou organização mudou. Recarregue a página para conferir antes de testar novamente."
    : code === "draft_model_unavailable" ? "Este modelo não está disponível. Confira o catálogo e escolha novamente."
      : code === "draft_credential_unavailable" ? "Esta credencial não está disponível. Confira a chave escolhida."
        : "Não foi possível concluir. Sua mensagem continua aqui; confira a configuração e tente novamente.";
  async function perform(action: () => Promise<void>) {
    setBusy(true); onBusy(true); setError(null);
    try { await action(); } catch { setError(failure("db_error")); }
    finally { setBusy(false); onBusy(false); }
  }
  return <section aria-labelledby="ensaio-title" className="min-w-0 space-y-4 rounded-xl border border-primary/30 bg-background p-4 sm:p-6">
    <div className="space-y-2">
      <h3 id="ensaio-title" className="text-lg font-semibold">{t("Ensaio de conversa, sem envio")}</h3>
      <p className="text-sm text-muted-foreground">{t("Prévia de texto apenas: não consulta memória ou ferramentas, não envia mensagens e não testa o WhatsApp.")}</p>
      <p className="text-sm">{t("O teste chama a IA escolhida e pode consumir créditos de API. Preparar e revisar não chamam a IA.")}</p>
    </div>
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      <div className="min-w-0 space-y-2">
        <Label htmlFor="ensaio-model">{t("Modelo do ensaio")}</Label>
        <select id="ensaio-model" value={model} disabled={busy || !panel} className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"
          onChange={e => { setModel(e.target.value); setCredential(""); setProof(null); setError(null); }}>
          <option value="">{t("Escolha um modelo de IA")}</option>
          {panel?.models.map(m => <option key={`${m.provider}/${m.model_id}`} value={`${m.provider}/${m.model_id}`}>{m.display_name} ({m.provider})</option>)}
        </select>
        {panel?.models.length === 0 && <p className="text-sm">{t("O catálogo está vazio. Você pode continuar depois e conferir os provedores no CRM.")}</p>}
      </div>
      <div className="min-w-0 space-y-2">
        <Label htmlFor="ensaio-credential">{t("Credencial do ensaio")}</Label>
        <select id="ensaio-credential" aria-describedby={!credential ? "ensaio-credential-help" : undefined} value={credential} disabled={busy || !chosen} className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"
          onChange={e => { setCredential(e.target.value); setProof(null); setError(null); }}>
          <option value="">{t("Credencial disponível")}</option>
          {panel?.credentials.filter(c => c.provider === chosen?.provider).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        {!credential && <p id="ensaio-credential-help" className="text-sm text-muted-foreground">{t("Credencial disponível deste provedor (organização/instalação)")}</p>}
      </div>
    </div>
    {dirty || revision < 1 ? <p className="text-sm">{t("Salve o rascunho antes de preparar, testar ou revisar.")}</p> : null}
    <Button type="button" variant="outline" disabled={blocked || !chosen} onClick={() => void perform(async () => {
      if (!chosen) return;
      const r = await prepararRascunho({ expected_context: context, expected_revision: revision, expected_version_id: selection?.version_id ?? null,
        provider: chosen.provider, model: chosen.model_id, credential_id: credential || null });
      if (!r.ok) { setProof(null); setError(failure(r.error)); return; }
      setSelection({ ...r, provider: chosen.provider, model: chosen.model_id, credential_id: credential || null });
      setProof(null);
      const read = await lerEnsaio({ expected_context: context });
      if (read.ok) { setPanel(read.panel); setProof(read.panel.proof); setProofEpoch(epoch); }
      else setError(failure(read.error));
    })}>{t("Preparar ensaio")}</Button>
    <div className="space-y-2">
      <Label htmlFor="ensaio-message">{t("Mensagem de exemplo")}</Label>
      <Textarea id="ensaio-message" value={message} disabled={busy} maxLength={4000} rows={3} onChange={e => setMessage(e.target.value)} />
      <p className="text-xs text-muted-foreground">{t("Use dados fictícios. Não inclua senhas nem dados reais de clientes.")}</p>
    </div>
    <Button type="button" disabled={blocked || !ready || !message.trim()} onClick={() => void perform(async () => {
      if (!selection) return;
      setProof(null);
      const r = await iniciarEnsaio({ expected_context: context, expected_revision: revision, expected_version_id: selection.version_id, sample_message: message });
      if (!r.ok) { setError(failure(r.error)); return; }
      setProof(r.proof); setProofEpoch(epoch);
    })}>{busy ? t("Aguarde…") : t("Testar mensagem")}</Button>
    {current?.status === "running" && <p role="status" className="text-sm">{t("O último ensaio não terminou. Aguarde um momento e teste novamente se ele foi interrompido.")}</p>}
    {current?.status === "failed" && <p role="alert" className="text-sm text-destructive">{t(current.error === "not_configured"
      ? "Não há chave utilizável para este provedor. Configure uma credencial e tente novamente."
      : current.error === "budget_exceeded" ? "O orçamento de IA bloqueou este teste. Confira o orçamento no CRM."
        : "A IA não concluiu uma resposta válida. O teste não foi aprovado; confira a configuração e tente novamente.")}</p>}
    {current?.status === "completed" && <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
      <p className="text-xs font-medium text-muted-foreground">{t("Mensagem testada")}</p>
      <p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{current.sample_message}</p>
      <p className="text-xs font-medium text-muted-foreground">{t("Resposta da IA para revisão")}</p>
      <p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{current.response}</p>
    </div>}
    <Button type="button" variant="outline" disabled={blocked || !reviewable} onClick={() => void perform(async () => {
      if (!current || !selection) return;
      const r = await revisarEnsaio({ expected_context: context, expected_revision: revision, expected_version_id: selection.version_id, run_id: current.run_id });
      if (r.ok) setProof(r.proof); else { setProof(null); setError(failure(r.error)); }
    })}>{t("Revisar resposta")}</Button>
    {current?.reviewed && <p role="status" className="text-sm">{t("Resposta revisada. Nenhum atendimento foi ativado.")}</p>}
    <Button type="button" disabled={blocked || !ready || !current?.reviewed || Boolean(error)} onClick={() => void perform(async () => {
      if (!selection || !current?.reviewed) return;
      const result = await confirmarAgenteRevisado({ expected_context: context, expected_revision: revision, expected_version_id: selection.version_id, run_id: current.run_id });
      if (!result.ok) { setProof(null); setError(failure(result.error)); return; }
      router.push("/onboarding/connect-whatsapp"); router.refresh();
    })}>{t("Continuar para conexão")}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
    <div className="border-t pt-4"><p className="mb-2 text-sm">{t("Continuar depois")}</p><ExplorarCrm /></div>
  </section>;
}
