"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { AreaNavigation } from "@/components/shell/AreaNavigation";
import { useInboundMessageAlerts } from "@/hooks/notifications/useInboundMessageAlerts";
import { useCrmAlerts } from "@/hooks/notifications/useCrmAlerts";
import { useNotifyOpenFromServiceWorker } from "@/lib/notifications/notify_open";

interface AppShellProps {
  sidebarCollapsed: boolean;
  children: ReactNode;
  notice?: ReactNode;
  onboardingNotice?: ReactNode;
}

export function AppShell({ sidebarCollapsed, children, notice, onboardingNotice }: AppShellProps) {
  const pathname = usePathname();
  const isInbox = pathname === "/app/inbox" || pathname.startsWith("/app/inbox/");
  useInboundMessageAlerts();
  useCrmAlerts();
  useNotifyOpenFromServiceWorker();
  return (
    <div className="flex h-screen h-dvh w-full overflow-hidden bg-workspace">
      <div className="hidden h-full md:block">
        <Sidebar collapsed={sidebarCollapsed} />
      </div>
      {/*
        `min-w-0` é o que permite a coluna de conteúdo ENCOLHER. Um flex item
        nasce com `min-width: auto`, ou seja, nunca fica menor que o conteúdo —
        então qualquer bloco largo (uma fila de abas, uma tabela) empurrava a
        PÁGINA INTEIRA para o lado em vez de rolar dentro da própria caixa, e o
        conteúdo sumia sem nada indicando que existia.

        Medido em 390x844 no detalhe do agente, que tem seis abas: a página
        estourava 476px na horizontal; com esta classe, 212px — o que sobra é o
        cabeçalho, presente também em telas que não têm abas (a lista de agentes
        estoura 236px). Isolado ancestral por ancestral: é este o que decide.
      */}
      {/*
        Sem `md:ml-*`: a barra voltou a ocupar lugar na linha (ver o comentário
        em `Sidebar.tsx`), então o que sobra para esta coluna é exatamente o que
        ela não usou. A margem existia para compensar uma barra `fixed`, e era a
        SEGUNDA medida da mesma coisa — a que discordava e deixava a barra por
        cima da lista.
      */}
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        {notice}
        <TopBar />
        <AreaNavigation />
        <main className={isInbox
          ? "flex min-h-0 flex-1 flex-col overflow-hidden bg-workspace p-2 md:p-4"
          : "min-h-0 flex-1 overflow-auto bg-workspace p-4 md:p-6"}>
          {onboardingNotice}
          {children}
        </main>
      </div>
    </div>
  );
}
