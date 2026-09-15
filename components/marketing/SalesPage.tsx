"use client";

import Link from "next/link";

import { PLANOS, formatarPrecoMensal, type PlanoId } from "@/lib/billing/planos";
import { useT } from "@/lib/i18n/IdiomaProvider";

type PlanoPublico = {
  nome: string;
  precoMensalCents: number;
  limites: {
    numerosWhatsapp: number;
    funcionariosIa: number;
    usuarios: number;
    funis: number | null;
  };
  recursos: {
    agenda: boolean;
    catalogo: boolean;
    baseDeConhecimento: boolean;
    leitorDeSite: boolean;
    followupsAutomaticos: boolean;
    googleAgenda: boolean;
    webhooks: boolean;
    radar: boolean;
  };
};

export type PlanosDaPagina = Record<PlanoId, PlanoPublico>;

const CTA = "https://crm.zapfloo.tech/signup";

function preencherLimites(texto: string, plano: PlanoPublico): string {
  return texto.replace(/\{(numerosWhatsapp|funcionariosIa|usuarios|funis)\}/g, (_, campo: keyof PlanoPublico["limites"]) =>
    String(plano.limites[campo]),
  );
}

function itensDoPlano(id: PlanoId, plano: PlanoPublico, t: (texto: string) => string): string[] {
  const quadros = plano.limites.funis === null
    ? t("Quadros sem limite: vendas, confirmação, entrega e pós-venda")
    : id === "basico" ? t("{funis} quadro de vendas") : t("{funis} quadros de vendas");
  const itens: Record<PlanoId, string[]> = {
    basico: [
      t("{numerosWhatsapp} WhatsApp"),
      t("{funcionariosIa} atendente de IA"),
      t("{usuarios} pessoa da equipe com acesso"),
      quadros,
      t("Agenda, catálogo com preços e respostas sobre o seu negócio"),
      t("Configuração a partir do seu site"),
    ],
    essencial: [
      t("Tudo do Básico, e mais:"),
      t("{usuarios} pessoas da equipe com acesso"),
      quadros,
      t("Mensagem automática pra quem parou de responder"),
      t("Horários sincronizados com o Google Agenda"),
    ],
    completo: [
      t("Tudo do Essencial, e mais:"),
      t("Até {numerosWhatsapp} WhatsApps e {funcionariosIa} atendentes de IA"),
      t("{usuarios} pessoas da equipe com acesso"),
      quadros,
      t("Aviso de clientes que estão esfriando"),
      t("Integração com outros sistemas"),
    ],
  };
  return itens[id].map((texto) => preencherLimites(texto, plano));
}

function Check() {
  return (
    <span
      className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent/15 text-xs font-bold text-accent"
      aria-hidden
    >
      ✓
    </span>
  );
}

export function SalesPage({
  planos = PLANOS,
  whatsappNumber = "",
}: {
  planos?: PlanosDaPagina;
  whatsappNumber?: string;
}) {
  const t = useT();
  const numeroWhatsapp = whatsappNumber.replace(/\D/g, "");
  const planosOrdenados = Object.entries(planos) as Array<[PlanoId, PlanoPublico]>;
  const frasesDosPlanos: Record<PlanoId, string> = {
    basico: t("Pra quem atende sozinho e quer parar de perder mensagem."),
    essencial: t("Pra quem tem equipe pequena e quer recuperar cliente que sumiu."),
    completo: t("Pra quem quer automatizar do primeiro contato ao pós-venda."),
  };

  return (
    <div data-theme="light" className="min-h-screen overflow-x-clip bg-background text-foreground">
      <header className="border-b border-border/70 bg-background/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/vendas" className="text-xl font-black tracking-tight" aria-label={t("Zapfloo — início")}>
            <span className="text-accent">zap</span>floo
          </Link>
          <Link
            href={CTA}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-sm transition hover:opacity-90"
          >
            {t("Testar grátis por 7 dias")}
          </Link>
        </div>
      </header>

      <main>
        <section className="border-b border-border/60 bg-gradient-to-b from-accent/10 via-background to-background">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
            <div>
              <p className="mb-5 inline-flex rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-sm font-semibold text-accent">
                {t("Atendente de IA para WhatsApp")}
              </p>
              <h1 className="max-w-3xl text-4xl font-black leading-[1.08] tracking-tight sm:text-6xl">
                {t("Seu WhatsApp responde, agenda e vende, mesmo quando você está ocupado.")}
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
                {t("O Zapfloo coloca uma atendente de IA no WhatsApp do seu pet shop, clínica ou salão. Ela tira dúvidas com os seus preços, marca horário e chama de volta quem sumiu. Você só entra na conversa quando precisar.")}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={CTA}
                  className="rounded-xl bg-accent px-6 py-3 text-center font-bold text-accent-foreground shadow-lg shadow-accent/20 transition hover:-translate-y-0.5"
                >
                  {t("Testar grátis por 7 dias")}
                </Link>
                {numeroWhatsapp ? (
                  <a
                    href={`https://wa.me/${numeroWhatsapp}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-border bg-card px-6 py-3 text-center font-semibold transition hover:border-accent/50"
                  >
                    {t("Falar pelo WhatsApp")}
                  </a>
                ) : null}
              </div>
              <p className="mt-4 text-sm text-muted-foreground">{t("Todos os recursos liberados no teste. Sem cartão de crédito.")}</p>
            </div>
          </div>
        </section>

        <section className="border-b border-border bg-muted/45" aria-labelledby="mensagens-sem-resposta">
          <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
            <h2 id="mensagens-sem-resposta" className="max-w-3xl text-3xl font-black tracking-tight sm:text-4xl">
              {t("Cada mensagem sem resposta é um cliente indo pro concorrente")}
            </h2>
            <ul className="mt-8 grid gap-5 md:grid-cols-3">
              {[
                t('O cliente pergunta o preço, você está no meio de um atendimento, e quando responde ele já marcou em outro lugar.'),
                t('Muita conversa começa com um "oi" e morre ali, porque ninguém chama de volta.'),
                t("A agenda vive espalhada entre o WhatsApp, o caderno e a memória."),
              ].map((texto) => <li key={texto} className="leading-7 text-muted-foreground">{texto}</li>)}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24" aria-labelledby="como-funciona">
          <h2 id="como-funciona" className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
            {t("Pronto pra atender em poucos passos")}
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              ["1", t("Conecte o seu WhatsApp"), t("Leia um QR Code com o celular do negócio, igual ao WhatsApp Web.")],
              ["2", t("Conte como o seu negócio funciona"), t("Serviços, preços, horários e regras. Se você tiver site, a gente lê e adianta essa parte pra você.")],
              ["3", t("Deixe a IA atender"), t("Ela responde, agenda e organiza cada cliente. Você acompanha tudo numa tela só e assume qualquer conversa quando quiser.")],
            ].map(([numero, titulo, texto]) => (
              <article key={numero} className="rounded-2xl border border-border bg-card p-6">
                <span className="grid size-10 place-items-center rounded-xl bg-accent text-sm font-black text-accent-foreground">
                  {numero}
                </span>
                <h3 className="mt-5 text-xl font-bold">{titulo}</h3>
                <p className="mt-2 leading-7 text-muted-foreground">{texto}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-border bg-muted/45">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
            <h2 className="mt-3 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl">
              {t("Uma atendente que não esquece ninguém")}
            </h2>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                [t("Responde na hora"), t("Nada de cliente esperando enquanto você atende outra pessoa.")],
                [t("Tira dúvidas com os seus preços"), t("Usa o seu catálogo e as informações que você cadastrou.")],
                [t("Marca horário"), t("Consulta os horários livres e agenda direto na conversa.")],
                [t("Chama de volta quem sumiu"), t("Manda mensagem na hora certa pra quem parou de responder.")],
                [t("Organiza tudo sozinha"), t("Cada cliente vai pra etapa certa: novo, interessado, agendado, fechado.")],
                [t("Passa pra você quando precisa"), t("Casos delicados vão pra uma pessoa da equipe, com a conversa inteira.")],
              ].map(([titulo, texto]) => (
                <article key={titulo} className="flex gap-3 rounded-2xl border border-border bg-background p-5">
                  <Check />
                  <div>
                    <h3 className="font-bold">{titulo}</h3>
                    <p className="mt-2 leading-7 text-muted-foreground">{texto}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24" aria-labelledby="planos">
          <div className="max-w-2xl">
            <h2 id="planos" className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              {t("Escolha o plano do tamanho do seu negócio")}
            </h2>
            <p className="mt-4 leading-7 text-muted-foreground">{t("Comece com 7 dias grátis em qualquer um. Troque de plano quando quiser.")}</p>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {planosOrdenados.map(([id, plano]) => (
              <article
                key={id}
                data-testid={`plano-${id}`}
                className={`flex flex-col rounded-3xl border bg-card p-6 ${id === "essencial" ? "border-accent shadow-lg shadow-accent/10" : "border-border"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xl font-bold">{t(plano.nome)}</h3>
                  {id === "essencial" ? <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-bold text-accent">{t("Recomendado")}</span> : null}
                </div>
                <p className="mt-3 leading-7 text-muted-foreground">{frasesDosPlanos[id]}</p>
                <p className="mt-4 flex items-end gap-2">
                  <span className="text-4xl font-black tracking-tight">{formatarPrecoMensal(plano.precoMensalCents)}</span>
                  <span className="pb-1 text-sm text-muted-foreground">{t("/mês")}</span>
                </p>
                <ul className="mb-8 mt-6 flex flex-col gap-3">
                  {itensDoPlano(id, plano, t).map((item) => (
                    <li key={item} className="flex gap-3 text-sm leading-6">
                      <Check />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={CTA}
                  className="mt-auto rounded-xl bg-accent px-5 py-3 text-center font-bold text-accent-foreground transition hover:opacity-90"
                >
                  {t("Testar grátis por 7 dias")}
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-border bg-muted/45">
          <div className="mx-auto max-w-4xl px-5 py-16 sm:px-8 sm:py-24">
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">{t("Perguntas frequentes")}</h2>
            <div className="mt-8 divide-y divide-border rounded-2xl border border-border bg-background px-5 sm:px-7">
              {[
                [t("Preciso entender de tecnologia?"), t("Não. A configuração é feita com perguntas simples, e se você tiver site, a gente aproveita as informações dele.")],
                [t("A IA pode falar besteira pro meu cliente?"), t("Ela só responde com base no que você cadastrou e confere cada mensagem antes de enviar. Preço e informação que vêm do seu site só passam a valer depois que você aprova. E você pode assumir qualquer conversa a qualquer momento.")],
                [t("O que o teste grátis inclui?"), t("7 dias com todos os recursos do plano Completo. Não pedimos cartão.")],
                [t("E quando o teste acaba?"), t("Seus dados continuam lá. A atendente de IA pausa até você escolher um plano.")],
                [t("Funciona com o número que eu já uso?"), t("Sim. Você conecta o WhatsApp que já usa no negócio.")],
                [t("Posso trocar de plano depois?"), t("Pode, pra cima ou pra baixo, e nada do que você já tem é apagado.")],
              ].map(([pergunta, resposta]) => (
                <details key={pergunta} className="group py-5">
                  <summary className="cursor-pointer list-none pr-8 font-bold marker:content-none">{pergunta}</summary>
                  <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">{resposta}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-5 py-16 text-center sm:px-8 sm:py-24">
          <h2 className="text-3xl font-black tracking-tight sm:text-5xl">{t("Teste por 7 dias e veja a IA atendendo o seu cliente de verdade.")}</h2>
          <Link
            href={CTA}
            className="mt-8 inline-flex rounded-xl bg-accent px-7 py-3 font-bold text-accent-foreground shadow-lg shadow-accent/20"
          >
            {t("Testar grátis por 7 dias")}
          </Link>
          <p className="mt-4 text-sm text-muted-foreground">{t("Sem cartão de crédito.")}</p>
        </section>
      </main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>{t("Zapfloo · atendimento e vendas no WhatsApp")}</p>
          <nav className="flex flex-wrap gap-5" aria-label={t("Documentos legais")}>
            <Link href="/legal/terms" className="hover:text-foreground">{t("Termos de uso")}</Link>
            <Link href="/legal/privacy" className="hover:text-foreground">{t("Privacidade")}</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
