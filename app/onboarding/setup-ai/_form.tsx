"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useT } from "@/hooks/i18n/useT";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createDefaultAgent, skipAi } from "@/app/actions/onboarding/createDefaultAgent";
import { salvarRascunho } from "@/app/actions/onboarding/rascunho";
import type { LeituraRascunho } from "@/lib/onboarding/rascunho";
import type { LeituraEnsaio } from "@/lib/onboarding/ensaio";
import { Ensaio } from "./_ensaio";
import type { PromptTemplate } from "@/lib/schemas/onboarding";
import { cn } from "@/lib/utils";
import { PROVEDOR_POR_ID } from "@/lib/ai/pontos/provedores";

/**
 * O jeito de falar, não o "estilo de prompt".
 *
 * Os rótulos anteriores eram "Amigável (e-commerce)", "Profissional" e "Suporte
 * minimalista" — dois deles amarrados a loja virtual, num produto cuja maioria
 * de adopters roda em clínica, imobiliária e infoproduto. Os identificadores
 * continuam os mesmos porque já existem gravados; só a fala mudou.
 */
/** "openrouter" no meio de uma frase é identificador vazando para a tela. */
function provedorLegivel(id: string | null, t: (texto: string) => string): string {
  if (!id) return t("da inteligência escolhida na instalação");
  return `${t("da")} ${PROVEDOR_POR_ID.get(id)?.rotulo ?? id}`;
}

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
  rascunhoInicial?: LeituraRascunho;
  ensaioInicial?: LeituraEnsaio;
}

export function SetupAiForm({ capacidades, conferencias, rascunhoInicial, ensaioInicial }: Props) {
  const t = useT();
  const inicial = rascunhoInicial?.ok ? rascunhoInicial.draft : null;
  const falhaDeLeitura = rascunhoInicial !== undefined && !rascunhoInicial.ok;
  // Fixa o contexto junto dos campos: refresh em outra organização não reaproveita o formulário antigo.
  const [contextoInicial] = useState(rascunhoInicial?.ok ? rascunhoInicial.context : "");
  const [name, setName] = useState(inicial?.configuration.name ?? "Atendente IA");
  const [jeito, setJeito] = useState<PromptTemplate>(inicial?.configuration.prompt_template ?? "ecommerce_friendly");
  const [regras, setRegras] = useState(inicial?.configuration.regras_da_casa ?? "");
  const [revision, setRevision] = useState(inicial?.revision ?? 0);
  const [salvo, setSalvo] = useState(false);
  const [erroRascunho, setErroRascunho] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [dirty, setDirty] = useState(!inicial);
  const [epoch, setEpoch] = useState(0);
  const [ensaioBusy, setEnsaioBusy] = useState(false);
  const [naoPublicado, setNaoPublicado] = useState<string | null>(null);
  const [causa, setCausa] = useState<"canal" | "modelo" | "chave" | null>(null);
  const [provedor, setProvedor] = useState<string | null>(null);
  const [motivoDoModelo, setMotivoDoModelo] = useState<
    "catalogo_vazio" | "nenhum_com_ferramentas" | null
  >(null);
  const [regrasNaoSalvas, setRegrasNaoSalvas] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const criarPeloCaminhoLegado = () => {
        const formData = new FormData();
        formData.set("name", name); formData.set("prompt_template", jeito); formData.set("regras_da_casa", regras);
        if (falhaDeLeitura || saving) return;
        startTransition(async () => {
          setNaoPublicado(null);
          setCausa(null);
          setProvedor(null);
          setMotivoDoModelo(null);
          setRegrasNaoSalvas(null);
          const res = await createDefaultAgent(formData);
          if (res && !res.ok) {
            toast.error(`${t("Falha ao criar agente:")} ${res.error}`);
            return;
          }
          if (res?.regras_nao_salvas) setRegrasNaoSalvas(res.regras_nao_salvas);
          // Sem chave utilizável não há o que publicar — e o conselho é outro:
          // não é esperar o catálogo nem trocar de provedor, é cadastrar a chave.
          if (res?.publish_blocked_by === "chave") {
            setCausa("chave");
            setProvedor(res.provider ?? null);
            toast.warning(t("Atendente criado, mas ainda não está no ar."));
            return;
          }
          if (res?.publish_blocked_by === "modelo") {
            setCausa("modelo");
            setProvedor(res.provider ?? null);
            setMotivoDoModelo(res.motivo_do_modelo ?? null);
            toast.warning(t("Atendente criado, mas ainda não está no ar."));
            return;
          }
          if (res?.publish_error) {
            setNaoPublicado(res.publish_error);
            setCausa("canal");
            toast.warning(t("Agente criado, mas ainda não publicado."));
          }
        });
      };
  return (
    <div className="space-y-6">
      {falhaDeLeitura && <p role="alert" className="text-sm text-destructive">{t("Não foi possível carregar seu rascunho. Recarregue a página antes de continuar.")}</p>}
      <fieldset disabled={pending || saving || ensaioBusy || falhaDeLeitura} onChange={() => { setSalvo(false); setDirty(true); setEpoch(e => e + 1); setErroRascunho(null); }} className="space-y-5 rounded-lg border bg-background p-6">
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

      <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
        <p className="text-sm">{t("Salve nome, jeito de falar e regras para continuar depois. Não precisa de chave de IA e não ativa atendimento.")}</p>
        <Button type="button" variant="outline" disabled={pending || saving || ensaioBusy || falhaDeLeitura || !contextoInicial} onClick={() => startSaving(async () => {
          setSalvo(false);
          setErroRascunho(null);
          try {
            const res = await salvarRascunho({ expected_context: contextoInicial, expected_revision: revision, configuration: { name, prompt_template: jeito, regras_da_casa: regras } });
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

      {ensaioInicial && <Ensaio initial={ensaioInicial} context={contextoInicial} revision={revision} dirty={dirty || saving || pending || falhaDeLeitura} epoch={epoch} onBusy={setEnsaioBusy} />}

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

      {regrasNaoSalvas && (
        <div
          role="alert"
          className="space-y-2 rounded-md border border-amber-300/60 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-950/20"
        >
          <p className="text-sm font-medium">
            {t("O atendente foi criado, mas as")} <strong>{t("regras da casa")}</strong>{" "}
            {t("não foram gravadas. Copie o que você escreveu antes de sair — e salve de novo em")}{" "}
            <strong>{t("IA › Memória")}</strong>.
          </p>
          <p className="text-xs text-muted-foreground">
            {t("Erro do banco de dados:")} <code className="break-all">{regrasNaoSalvas}</code>
          </p>
        </div>
      )}

      {causa === "chave" && (
        <div
          role="alert"
          className="space-y-3 rounded-md border border-amber-300/60 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-950/20"
        >
          <p className="text-sm font-medium">
            {t("Seu atendente foi criado, mas ficou como")} <strong>{t("rascunho")}</strong>{" "}
            {t("— ele ainda não tem com o que pensar.")}
          </p>
          <p className="text-sm">
            {t("Não achei chave de")} {provedorLegivel(provedor, t)}{" "}
            {t("nem cadastrada aqui, nem vinda da instalação. Cole a chave no campo acima («o cérebro dele») e crie o atendente de novo — ou cadastre em")}{" "}
            <strong>{t("IA › Credenciais")}</strong>.
          </p>
          {/*
            ⚠️ SEM ESTA SAÍDA O PASSO É UM BECO. O aviso irmão (o de modelo) já
            oferecia seguir, e este nasceu sem — quem instala sem chave nenhuma
            (o caminho que o CI exercita) ficava preso na tela de treinar, com um
            diagnóstico correto e nenhum botão. O atendente EXISTE como rascunho;
            o que falta é o cérebro, e isso se resolve depois sem travar o resto
            do wizard.
          */}
          <div className="flex sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                window.location.href = "/onboarding";
              }}
              className="w-full sm:w-auto"
            >
              {t("Continuar sem publicar")}
            </Button>
          </div>
        </div>
      )}

      {causa === "modelo" && (
        <div
          role="alert"
          className="space-y-3 rounded-md border border-amber-300/60 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-950/20"
        >
          <p className="text-sm font-medium">
            {t("Seu atendente foi criado, mas ficou como")} <strong>{t("rascunho")}</strong>{" "}
            {t("— e rascunho não responde mensagem.")}
          </p>
          {/*
            As duas causas pedem conselhos OPOSTOS, e dar o errado custa caro:
            mandar esperar a sincronização diária quem já tem o catálogo
            completo é mandar esperar para sempre. Foi o que a tela fazia, e só
            apareceu percorrendo o wizard num ambiente com 400 modelos baixados.
          */}
          {motivoDoModelo === "nenhum_com_ferramentas" ? (
            <p className="text-sm">
              {t("Os modelos")} {provedorLegivel(provedor, t)}{" "}
              {t(
                "que esta instalação conhece não sabem usar ferramentas — sem isso ele conversaria bem e nunca criaria um cliente nem moveria um negócio no funil. Escolha outra empresa de IA em",
              )}{" "}
              <strong>{t("IA › Provedores")}</strong>.
            </p>
          ) : (
            <p className="text-sm">
              {t("Esta instalação ainda não tem a lista de modelos")} {provedorLegivel(provedor, t)}.{" "}
              {t("Ela é baixada automaticamente uma vez por dia; depois disso, publique em")}{" "}
              <strong>{t("IA › Agentes")}</strong>.
            </p>
          )}
          <div className="flex sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                window.location.href = "/onboarding";
              }}
              className="w-full sm:w-auto"
            >
              {t("Continuar sem publicar")}
            </Button>
          </div>
        </div>
      )}

      {naoPublicado && (
        <div
          role="alert"
          className="space-y-3 rounded-md border border-amber-300/60 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-950/20"
        >
          <p className="text-sm font-medium">
            {t("Seu agente foi criado, mas ficou como")} <strong>{t("rascunho")}</strong>:{" "}
            {t(
              "não consegui ler os números de WhatsApp desta instalação, então não dá pra dizer em qual número ele atenderia — e rascunho não responde mensagem.",
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("Erro do banco de dados:")} <code className="break-all">{naoPublicado}</code>
          </p>
          <p className="text-sm">
            {t("Tente de novo no botão abaixo (clicar de novo não cria um segundo agente) ou siga agora e publique depois em")}{" "}
            <strong>{t("IA › Agentes")}</strong>.
          </p>
          <div className="flex sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                window.location.href = "/onboarding";
              }}
              className="w-full sm:w-auto"
            >
              {t("Continuar sem publicar")}
            </Button>
          </div>
        </div>
      )}

      <p className="text-sm text-muted-foreground">{t("Caminho anterior: criar o agente e tentar publicar nos canais existentes.")}</p>
      <div className="flex flex-wrap justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={pending || saving}
          onClick={() => startTransition(() => void skipAi())}
        >
          {t("Pular")}
        </Button>
        <Button type="button" onClick={criarPeloCaminhoLegado} disabled={pending || saving || ensaioBusy || falhaDeLeitura}>
          {pending ? t("Criando...") : t("Criar e continuar")}
        </Button>
      </div>
    </div>
  );
}
