"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { useT } from "@/hooks/i18n/useT";

import { Button } from "@/components/ui/button";
import { finishOnboarding } from "@/app/actions/onboarding/finishOnboarding";
import type { ItemDoResumo } from "@/lib/onboarding/passos";
import type { PecaDoSistema } from "@/lib/onboarding/o-que-mais-existe";

function observarDispensa(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

export function DoneClient({
  itens,
  pecas,
  orgId,
  site,
}: {
  itens: ItemDoResumo[];
  pecas: PecaDoSistema[];
  orgId: string;
  site: { produtos: number; perguntas: number; fonteId: string | null };
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const pendentes = itens.filter((i) => !i.feito);
  const [dispensaLocal, setDispensaLocal] = useState<string | null>(null);
  const [revisandoSite, setRevisandoSite] = useState(false);
  const chaveDaDispensa = `onboarding-site-depois:${orgId}`;

  const dispensado = useSyncExternalStore(observarDispensa, () => {
    try {
      return sessionStorage.getItem(chaveDaDispensa) === "sim";
    } catch {
      // Armazenamento desativado não impede usar o CRM nem dispensar o cartão.
      return false;
    }
  }, () => true);
  // O servidor não conhece a dispensa local. Esperar a hidratação evita
  // piscar um convite que a pessoa já dispensou ao recarregar esta página.
  const ocultarSite = dispensado || dispensaLocal === chaveDaDispensa;

  function deixarParaDepois() {
    setDispensaLocal(chaveDaDispensa);
    try { sessionStorage.setItem(chaveDaDispensa, "sim"); } catch { /* A dispensa em memória continua valendo. */ }
  }

  function concluirParaRevisar(destino: "/app/products" | "/app/ai/knowledge/sources") {
    startTransition(async () => {
      const res = await finishOnboarding(destino);
      if (res && !res.ok) toast.error(`${t("Falha:")} ${res.error}`);
    });
  }

  return (
    <div className="space-y-6 rounded-lg border bg-background p-6">
      <div className="space-y-1 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">{t("Tudo pronto!")}</h2>
        <p className="text-sm text-muted-foreground">
          {pendentes.length === 0
            ? t("Seu funcionário está montado. Daqui em diante é só acompanhar.")
            : t("Seu funcionário já está de pé. O que ficou para depois continua te esperando.")}
        </p>
      </div>

      <ul className="mx-auto max-w-sm space-y-2 text-left text-sm">
        {itens.map((it) => (
          <li key={it.segmento} className="flex items-center gap-2">
            <span
              aria-hidden
              className={
                "inline-block h-2 w-2 rounded-full " +
                (it.feito ? "bg-emerald-500" : "bg-muted-foreground/30")
              }
            />
            <span className={it.feito ? "" : "text-muted-foreground"}>
              {t(it.rotulo)}
              {/*
                "Pulado" é escolha da pessoa; "ainda não" é o que ela não
                chegou a fazer. Antes tudo que não estivesse feito virava
                "(pulado)", inclusive passo que a instalação nunca ofereceu —
                o wizard cobrando o que ninguém pediu.
              */}
              {it.pulado ? ` (${t("você pulou")})` : it.feito ? "" : ` (${t("ainda não")})`}
            </span>
          </li>
        ))}
      </ul>

      {!ocultarSite && (site.produtos > 0 || site.perguntas > 0) ? (
        <section aria-labelledby="pendencias-do-site" className="space-y-3 rounded-lg border bg-background p-4">
          <h3 id="pendencias-do-site" className="text-sm font-medium">{t("Também preparei, do seu site:")}</h3>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {site.produtos > 0 ? <li>{site.produtos} {t("produtos com preço — aguardando sua conferência")}</li> : null}
            {site.perguntas > 0 ? <li>{site.perguntas} {t("perguntas frequentes — aguardando sua conferência")}</li> : null}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setRevisandoSite(true)}>{t("Revisar agora")}</Button>
            <Button type="button" variant="ghost" onClick={deixarParaDepois}>{t("Depois")}</Button>
          </div>
          {revisandoSite ? (
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {site.produtos > 0 ? <button type="button" disabled={pending} onClick={() => concluirParaRevisar("/app/products")} className="text-left underline underline-offset-2 disabled:opacity-50">{t("Conferir produtos e preços")}</button> : null}
              {site.perguntas > 0 ? <button type="button" disabled={pending} onClick={() => concluirParaRevisar("/app/ai/knowledge/sources")} className="text-left underline underline-offset-2 disabled:opacity-50">{t("Conferir perguntas frequentes")}</button> : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {/*
        O wizard acabava aqui, com um botão que entregava a pessoa numa caixa de
        conversas vazia. Ela tinha acabado de montar um funcionário e não fazia
        ideia de que existe um lugar onde ele pede ajuda, outro que mostra quem
        esfriou, outro onde ele propõe as próprias melhorias. Descobrir isso
        ficava por conta da curiosidade — e quase ninguém volta para explorar
        menu.
      */}
      <section className="space-y-3 border-t pt-6">
        <div>
          <h3 className="text-sm font-medium">{t("O que mais tem aqui")}</h3>
          <p className="text-xs text-muted-foreground">
            {t("Você não precisa mexer em nada disso agora. É só para saber que existe.")}
          </p>
        </div>
        {/*
          Cada peça abre e mostra COMO funciona, em passos. Uma frase basta para
          dizer que a peça existe; não basta para o follow-up, que é a peça mais
          técnica do produto e a que mais assusta pelo nome — quem lê "volta a
          falar com quem sumiu" sem saber que o retorno PARA quando o cliente
          responde imagina um robô perseguindo cliente, e desliga justamente o
          que mais recupera venda.

          Fechado por padrão: quem acabou de montar o funcionário não precisa ler
          seis tutoriais agora. O que ele precisa é saber que a explicação existe
          e está a um clique.
        */}
        <ul className="grid gap-2 sm:grid-cols-2">
          {pecas.map((p) => (
            <li key={p.href} className="rounded-md border p-3">
              <a href={p.href} className="text-sm font-medium underline-offset-2 hover:underline">
                {t(p.comoChamar)}
              </a>
              <span className="ml-1 text-xs text-muted-foreground">({t(p.label)})</span>
              <p className="mt-1 text-xs text-muted-foreground">{t(p.porQue)}</p>

              <details className="group mt-2">
                <summary className="cursor-pointer list-none text-xs text-muted-foreground underline underline-offset-2">
                  {t("Como funciona")}
                </summary>
                <ol className="mt-2 space-y-1.5">
                  {p.comoFunciona.map((passo, i) => (
                    <li key={passo} className="flex gap-2 text-xs text-muted-foreground">
                      <span
                        aria-hidden
                        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px]"
                      >
                        {i + 1}
                      </span>
                      <span>{t(passo)}</span>
                    </li>
                  ))}
                </ol>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex justify-center">
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await finishOnboarding();
              if (res && !res.ok) toast.error(`${t("Falha:")} ${res.error}`);
            })
          }
        >
          {pending ? t("Finalizando...") : t("Começar a usar")}
        </Button>
      </div>
    </div>
  );
}
