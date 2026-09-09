"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useT } from "@/hooks/i18n/useT";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { salvarRascunho } from "@/app/actions/onboarding/rascunho";
import type { LeituraRascunho } from "@/lib/onboarding/rascunho";
import type { LeituraEnsaio } from "@/lib/onboarding/ensaio";
import { Ensaio } from "./_ensaio";
import type { PromptTemplate } from "@/lib/schemas/onboarding";
import { cn } from "@/lib/utils";


const JEITOS: { id: PromptTemplate; titulo: string; desc: string }[] = [
  {
    id: "ecommerce_friendly",
    titulo: "Próximo e caloroso",
    desc: "Conversa como gente, puxa assunto, tranquiliza. Bom para quem vende no dia a dia.",
  },
  {
    id: "ecommerce_professional",
    titulo: "Objetivo e cordial",
    desc: "Vai direto ao ponto sem ser seco, e sempre indica o próximo passo.",
  },
  {
    id: "support_minimal",
    titulo: "Curto e prático",
    desc: "Frases curtas, pergunta só o essencial e chama uma pessoa cedo.",
  },
];

interface Props {
  /** O que ele já sabe fazer, em linguagem de dono de negócio. */
  capacidades: string[];
  /** O que ele nunca faz — as conferências antes de cada mensagem sair. */
  conferencias: string[];
  negocio?: string;
  rascunhoInicial?: LeituraRascunho;
  ensaioInicial?: LeituraEnsaio;
}

export function SetupAiForm({ capacidades, conferencias, rascunhoInicial, ensaioInicial, negocio }: Props) {
  const t = useT();
  const inicial = rascunhoInicial?.ok ? rascunhoInicial.draft : null;
  const falhaDeLeitura = rascunhoInicial !== undefined && !rascunhoInicial.ok;
  // Fixa o contexto junto dos campos: refresh em outra organização não reaproveita o formulário antigo.
  const [contextoInicial] = useState(rascunhoInicial?.ok ? rascunhoInicial.context : "");
  const [name, setName] = useState(inicial?.configuration.name ?? "Atendente IA");
  const [jeito, setJeito] = useState<PromptTemplate>(inicial?.configuration.prompt_template ?? "ecommerce_friendly");
  const [objetivo, setObjetivo] = useState(inicial?.configuration.objetivo ?? "");
  const [regras, setRegras] = useState(inicial?.configuration.regras_da_casa ?? "");
  const [revision, setRevision] = useState(inicial?.revision ?? 0);
  const [salvo, setSalvo] = useState(false);
  const [erroRascunho, setErroRascunho] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [dirty, setDirty] = useState(!inicial);
  const [epoch, setEpoch] = useState(0);
  const [ensaioBusy, setEnsaioBusy] = useState(false);
  return (
    <div className="space-y-6">
      {falhaDeLeitura && <p role="alert" className="text-sm text-destructive">{t("Não foi possível carregar seu rascunho. Recarregue a página antes de continuar.")}</p>}
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_16rem]">
      <fieldset disabled={saving || ensaioBusy || falhaDeLeitura} onChange={() => { setSalvo(false); setDirty(true); setEpoch(e => e + 1); setErroRascunho(null); }} className="space-y-5 rounded-lg border bg-background p-6">
        <div className="space-y-2">
          <Label htmlFor="name">{t("Como ele vai se chamar")}</Label>
          <Input
            id="name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            maxLength={80}
            required
          />
          <p className="text-xs text-muted-foreground">
            {t("É o nome que aparece para o seu time. O cliente vê só a conversa.")}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="objetivo">{t("Objetivo do agente")}</Label>
          <Textarea id="objetivo" value={objetivo} onChange={e => setObjetivo(e.target.value)} rows={3} />
          <p className="text-xs text-muted-foreground">{t("O que você quer que ele ajude a resolver?")}</p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("O jeito dele falar")}</legend>
          <div className="grid gap-2">
            {JEITOS.map((j) => (
              <label
                key={j.id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
                  jeito === j.id ? "border-primary bg-primary/5" : "hover:bg-muted/40",
                )}
              >
                <input
                  type="radio"
                  name="prompt_template"
                  value={j.id}
                  checked={jeito === j.id}
                  onChange={() => setJeito(j.id)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-medium">{t(j.titulo)}</span>
                  <span className="block text-xs text-muted-foreground">{t(j.desc)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          <Label htmlFor="regras_da_casa">{t("As regras da casa (opcional)")}</Label>
          <Textarea
            id="regras_da_casa"
            name="regras_da_casa"
            value={regras}
            onChange={(e) => setRegras(e.target.value)}
            rows={5}
            maxLength={20000}
            placeholder={
              `${t("Nunca prometa desconto sem confirmar com uma pessoa.")}\n` +
              `${t("Horário de atendimento: 9h às 18h, de segunda a sexta.")}\n` +
              t("Sempre chame o cliente pelo primeiro nome.")
            }
          />
          <p className="text-xs text-muted-foreground">
            {t(
              "O que vale para qualquer atendimento aqui. Pode deixar em branco agora e escrever depois — ele aprende com você ao longo do tempo.",
            )}
          </p>
        </div>
      </fieldset>
      <aside aria-label={t("Resumo do agente")} className="min-w-0 space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-5 [overflow-wrap:anywhere]">
        <h3 className="font-semibold">{t("Resumo do agente")}</h3>
        <p className="text-sm">{negocio}</p><p className="font-medium">{name}</p>
        <p className="whitespace-pre-wrap text-sm">{objetivo || t("Defina o objetivo do agente")}</p>
        <p className="text-sm text-muted-foreground">{t(JEITOS.find(j => j.id === jeito)!.titulo)}</p>
        <p className="text-xs">{t("Rascunho: nenhum atendimento ativado.")}</p>
      </aside>
      </div>

      <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
        <p className="text-sm">{t("Salve nome, jeito de falar e regras para continuar depois. Não precisa de chave de IA e não ativa atendimento.")}</p>
        <Button type="button" variant="outline" disabled={saving || ensaioBusy || falhaDeLeitura || !contextoInicial} onClick={() => startSaving(async () => {
          setSalvo(false);
          setErroRascunho(null);
          try {
            const res = await salvarRascunho({ expected_context: contextoInicial, expected_revision: revision, configuration: { name, prompt_template: jeito, regras_da_casa: regras, objetivo } });
            if (res.ok) { setRevision(res.revision); setName(name.trim()); setSalvo(true); setDirty(false); return; }
            setErroRascunho(res.error === "draft_context_changed"
              ? t("A organização ou a sessão mudou em outra aba. Copie suas alterações e recarregue a página antes de salvar.")
              : res.error === "draft_conflict"
              ? t("Este rascunho mudou em outra aba. Copie suas alterações e recarregue a página para conferir a versão salva.")
              : res.error === "invalid_input"
                ? t("Confira o nome (2 a 80 caracteres) e as regras (até 20.000 caracteres).")
                : t("Não foi possível salvar. Seus campos continuam aqui; confira seu acesso antes de tentar novamente."));
          } catch {
            setErroRascunho(t("Não foi possível salvar. Seus campos continuam aqui; confira seu acesso antes de tentar novamente."));
          }
        })}>{saving ? t("Salvando...") : t("Salvar rascunho")}</Button>
        {salvo && <p role="status" className="text-sm">{t("Rascunho salvo. Nenhum atendimento foi ativado.")}</p>}
        {erroRascunho && <p role="alert" className="text-sm text-destructive">{erroRascunho}</p>}
      </div>

      {ensaioInicial && <Ensaio initial={ensaioInicial} context={contextoInicial} revision={revision} dirty={dirty || saving || falhaDeLeitura} epoch={epoch} onBusy={setEnsaioBusy} />}

      {/*
        Nada aqui pede configuração: é o que ele JÁ vem sabendo. O passo
        anterior entregava um funcionário sem dizer uma linha sobre o que ele
        é capaz de fazer — e a primeira pergunta de quem contrata alguém é
        exatamente essa.
      */}
      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-lg border bg-background p-4">
          <h3 className="text-sm font-medium">{t("Ele já vem sabendo")}</h3>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {capacidades.map((c) => (
              <li key={c}>· {c}</li>
            ))}
          </ul>
        </section>
        <section className="rounded-lg border bg-background p-4">
          <h3 className="text-sm font-medium">{t("E nunca vai fazer")}</h3>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {conferencias.map((c) => (
              <li key={c}>· {c}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("Essas conferências acontecem antes de cada mensagem sair, e não têm interruptor.")}
          </p>
        </section>
      </div>

      <Link className="inline-block text-sm underline underline-offset-4" href="/onboarding/welcome">{t("Voltar ao negócio")}</Link>
    </div>
  );
}
