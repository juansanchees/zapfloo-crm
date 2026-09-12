"use client";

import type { ReactNode } from "react";
import { useMarcaDaInstalacao } from "@/lib/branding/contexto";
import { useT } from "@/hooks/i18n/useT";
import { Stepper, type PassoVisivel } from "./Stepper";
import styles from "./OnboardingFrame.module.css";

interface Props {
  orgName: string;
  passos: PassoVisivel[];
  controls?: ReactNode;
  children: ReactNode;
}

/** Texto no conteúdo usa a mesma marca resolvida que o cabeçalho, inclusive no SSR. */
export function NomeDaInstalacao() {
  return <>{useMarcaDaInstalacao().name}</>;
}

/** Apresentação apenas: a ordem, o progresso e as ações continuam no servidor. */
export function OnboardingFrame({ orgName, passos, controls, children }: Props) {
  const marca = useMarcaDaInstalacao();
  const t = useT();
  return (
    <div className={styles.frame} data-testid="onboarding-frame">
      <header className={styles.header}>
        <div className={styles.brand}>
          {marca.logoUrl ? (
            // URL já validada pelo resolvedor. Logo de instalação pode mudar
            // sem rebuild e não exige configurar hosts no otimizador do Next.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={marca.logoUrl} alt={marca.name} className={styles.logo} />
          ) : <span>{marca.name}</span>}
        </div>
        <div className={styles.controls}>{controls}</div>
      </header>
      <div className={styles.workspace}>
        <aside className={styles.sidebar}>
          <div className={styles.identity}>
            <p className={styles.eyebrow}>{t("Seu negócio")}</p>
            <h1 className={styles.title}>{orgName}</h1>
            <p className={styles.description}>
              {t("Vamos montar quem vai atender seus clientes — e onde ele vai trabalhar.")}
            </p>
          </div>
          <div className={styles.progress}><Stepper passos={passos} /></div>
        </aside>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
