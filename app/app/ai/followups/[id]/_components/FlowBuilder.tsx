"use client";

import dynamic from "next/dynamic";
import { useLayoutEffect, useRef } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import type { FollowupFlowDetailRow } from "@/hooks/followup/useFollowupFlow";

/**
 * @xyflow/react is a large dependency — this is the ONLY route that loads it.
 * `ssr:false` + dynamic import keeps it out of the main bundle entirely; see
 * the bundle delta note in the task report.
 */
const FlowCanvas = dynamic(() => import("./FlowCanvas").then((m) => m.FlowCanvas), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[600px] items-center justify-center p-6">
      <Skeleton className="h-full w-full" />
    </div>
  ),
});

interface Props {
  flowId: string;
  initialData: FollowupFlowDetailRow;
}

export function FlowBuilder({ flowId, initialData }: Props) {
  const workspaceRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const workspace = workspaceRef.current;
    const main = workspace?.closest("main");
    if (!workspace || !main) return;

    // A shell tem wrappers de altura automática. Medir o espaço restante evita
    // porcentagens cíclicas e não pressupõe a altura das barras/avisos da instalação.
    const resize = () => {
      const offset = workspace.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
      workspace.style.height = `${Math.max(0, main.clientHeight - offset)}px`;
      // O piso anterior de 600px continua rolando em janelas curtas. Em janelas
      // maiores, não criar rolagem só pelo padding inferior externo ao editor.
      workspace.style.marginBottom = `-${parseFloat(getComputedStyle(main).paddingBottom) || 0}px`;
    };
    const observer = new ResizeObserver(resize);
    const observeAvailableSpace = () => {
      observer.disconnect();
      observer.observe(main);
      // Avisos podem aparecer, crescer ou sumir sem redimensionar o main.
      // Não observar o wrapper do editor: sua altura depende deste cálculo.
      for (const sibling of main.children) {
        if (sibling.contains(workspace)) break;
        observer.observe(sibling);
      }
      resize();
    };
    observeAvailableSpace();
    const notices = new MutationObserver(observeAvailableSpace);
    notices.observe(main, { childList: true });
    return () => {
      observer.disconnect();
      notices.disconnect();
    };
  }, []);

  return (
    <div ref={workspaceRef} className="flex min-h-[600px] shrink-0 flex-col" data-testid="flow-builder-shell">
      <FlowCanvas flowId={flowId} initialData={initialData} />
    </div>
  );
}
