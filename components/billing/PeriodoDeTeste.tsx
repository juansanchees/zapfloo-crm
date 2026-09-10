"use client";

import { useEffect, useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { tempoRestanteDoTeste } from "@/lib/billing/periodo-de-teste";

interface Props {
  fim: string | null;
  agora: number;
}

/** A data vem do servidor; o contador nunca cria ou renova um período. */
export function PeriodoDeTeste({ fim, agora }: Props) {
  const t = useT();
  const idioma = useTagDeIdioma();
  const [relogio, setRelogio] = useState({ base: agora, fim, decorrido: 0 });
  const decorrido = relogio.base === agora && relogio.fim === fim ? relogio.decorrido : 0;
  useEffect(() => {
    const inicio = Date.now();
    const atualizar = () => setRelogio({ base: agora, fim, decorrido: Math.max(0, Date.now() - inicio) });
    const intervalo = window.setInterval(atualizar, 15_000);
    document.addEventListener("visibilitychange", atualizar);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", atualizar);
    };
  }, [agora, fim]);

  const tempo = fim ? tempoRestanteDoTeste(fim, agora + decorrido) : null;
  if (!fim || !tempo) {
    return <aside aria-label={t("Período de testes")} className="shrink-0 border-b bg-muted/50 px-4 py-3 text-sm">
      {t("Não foi possível consultar o término do período de testes. Recarregue a página.")}
    </aside>;
  }

  const data = new Intl.DateTimeFormat(idioma, {
    dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo",
  }).format(new Date(fim));

  return <aside aria-label={t("Período de testes")} data-testid="periodo-de-teste"
    className="flex min-w-0 shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-primary/20 bg-primary/10 px-4 py-3 text-sm [overflow-wrap:anywhere]">
    <div className="min-w-0">
      <p className="font-semibold">{tempo.encerrado ? t("Seu período de testes terminou") : t("Você está no período de testes grátis")}</p>
      <p className="text-muted-foreground">
        {tempo.encerrado ? t("Encerrado em") : t("Termina em")} {" "}
        <time dateTime={fim}>{data}</time> {" "}
        <span>({t("horário de Brasília")})</span>
      </p>
    </div>
    {!tempo.encerrado && <p className="font-medium tabular-nums">
      {t("Tempo restante:")} {tempo.dias > 0 && <>{tempo.dias} {tempo.dias === 1 ? t("dia") : t("dias")} · </>}
      {tempo.horas} h · {tempo.minutos} min
    </p>}
  </aside>;
}
