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

function plural(quantidade: number, singular: string, pluralDaPalavra: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : pluralDaPalavra}`;
}

function itensDoPlano(plano: PlanoPublico): string[] {
  const itens = [
    plural(plano.limites.numerosWhatsapp, "número de WhatsApp", "números de WhatsApp"),
    plural(plano.limites.funcionariosIa, "funcionário de IA", "funcionários de IA"),
    plural(plano.limites.usuarios, "usuário", "usuários"),
    plano.limites.funis === null ? "Funis sem limite" : plural(plano.limites.funis, "funil", "funis"),
    "Agenda, catálogo e base de conhecimento",
    "Leitor do seu site",
  ];

  if (plano.recursos.followupsAutomaticos) itens.push("Follow-ups automáticos");
  if (plano.recursos.googleAgenda) itens.push("Google Agenda");
  if (plano.recursos.webhooks) itens.push("Webhooks e integrações");
  if (plano.recursos.radar) itens.push("Radar de clientes em risco");
  return itens;
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
            {t("Testar grátis")}
          </Link>
        </div>
      </header>

      <main>
        <section className="border-b border-border/60 bg-gradient-to-b from-accent/10 via-background to-background">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <p className="mb-5 inline-flex rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-sm font-semibold text-accent">
                {t("Atendimento e vendas no WhatsApp")}
              </p>
              <h1 className="max-w-3xl text-4xl font-black leading-[1.08] tracking-tight sm:text-6xl">
                {t("A IA atende, qualifica e vende pelo WhatsApp do seu negócio.")}
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
                {t("Para pet shops, clínicas, consultórios e salões organizarem o atendimento sem deixar clientes esperando.")}
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
            </div>

            <div className="rounded-3xl border border-border bg-card p-5 shadow-xl shadow-foreground/5 sm:p-7">
              <div className="mb-5 flex items-center gap-2 border-b border-border pb-4">
                <span className="size-3 rounded-full bg-destructive/70" />
                <span className="size-3 rounded-full bg-warning/70" />
                <span className="size-3 rounded-full bg-success/70" />
                <span className="ml-2 text-sm font-medium text-muted-foreground">{t("Atendimento em andamento")}</span>
              </div>
              <div className="space-y-4 text-sm">
                <div className="mr-8 rounded-2xl rounded-tl-sm bg-muted p-4">
                  {t("Oi! Quais horários vocês têm amanhã?")}
                </div>
                <div className="ml-8 rounded-2xl rounded-tr-sm bg-accent/12 p-4">
                  {t("Temos horários às 10h e 15h. Qual fica melhor para você?")}
                </div>
                <div className="rounded-2xl border border-accent/20 bg-accent/5 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-accent">{t("Organizado automaticamente")}</p>
                  <p className="mt-1 font-medium">{t("Cliente qualificado · aguardando escolha do horário")}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24" aria-labelledby="como-funciona">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent">{t("Simples desde o primeiro dia")}</p>
          <h2 id="como-funciona" className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
            {t("Como funciona")}
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              ["1", t("Conecte seu número"), t("Escolha a conexão disponível para o seu negócio e veja o estado dela na tela.")],
              ["2", t("Ensine o seu atendimento"), t("Informe serviços, horários e regras. O Zapfloo organiza tudo com você.")],
              ["3", t("Comece a atender"), t("Acompanhe conversas, agenda e funil enquanto a IA cuida das respostas permitidas.")],
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
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent">{t("Um atendimento que continua")}</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl">
              {t("Da primeira dúvida ao próximo passo do cliente")}
            </h2>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {[
                t("Responde na hora"),
                t("Tira dúvidas com o seu catálogo"),
                t("Marca horário"),
                t("Retoma quem sumiu"),
                t("Organiza o funil"),
              ].map((item) => (
                <div key={item} className="flex gap-3 rounded-2xl border border-border bg-background p-5 font-semibold">
                  <Check />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24" aria-labelledby="planos">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent">{t("Planos mensais")}</p>
            <h2 id="planos" className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              {t("Escolha o espaço que o seu atendimento precisa")}
            </h2>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {planosOrdenados.map(([id, plano]) => (
              <article
                key={id}
                data-testid={`plano-${id}`}
                className={`flex flex-col rounded-3xl border bg-card p-6 ${id === "essencial" ? "border-accent shadow-lg shadow-accent/10" : "border-border"}`}
              >
                <h3 className="text-xl font-bold">{plano.nome}</h3>
                <p className="mt-4 flex items-end gap-2">
                  <span className="text-4xl font-black tracking-tight">{formatarPrecoMensal(plano.precoMensalCents)}</span>
                  <span className="pb-1 text-sm text-muted-foreground">{t("por mês")}</span>
                </p>
                <ul className="mt-6 flex flex-col gap-3">
                  {itensDoPlano(plano).map((item) => (
                    <li key={item} className="flex gap-3 text-sm leading-6">
                      <Check />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={CTA}
                  className="mt-8 rounded-xl bg-accent px-5 py-3 text-center font-bold text-accent-foreground transition hover:opacity-90"
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
                [t("O teste libera quais recursos?"), t("Durante os 7 dias de teste, você usa os recursos do plano Completo.")],
                [t("O que acontece quando o teste termina?"), t("O CRM e seus dados continuam disponíveis. A IA fica pausada até a ativação de um plano.")],
                [t("Como o WhatsApp é conectado?"), t("A plataforma diferencia a API Oficial da Meta e a conexão por QR. Você escolhe a opção disponível para a sua operação.")],
                [t("Preciso montar o funil do zero?"), t("Não. Há modelos prontos por tipo de negócio e para etapas de pós-venda; você pode ajustá-los depois.")],
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
          <h2 className="text-3xl font-black tracking-tight sm:text-5xl">{t("Seu atendimento pode começar hoje.")}</h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
            {t("Configure o negócio, conecte o WhatsApp e veja o funcionário responder antes de colocá-lo no ar.")}
          </p>
          <Link
            href={CTA}
            className="mt-8 inline-flex rounded-xl bg-accent px-7 py-3 font-bold text-accent-foreground shadow-lg shadow-accent/20"
          >
            {t("Testar grátis por 7 dias")}
          </Link>
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
