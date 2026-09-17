"use client";

import { useRouter } from "next/navigation";

import { PipelinePageClient } from "@/app/app/pipelines/[id]/_client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FunisClient, type FunilDaLista } from "../_client";

interface KanbanWorkspaceProps {
  funis: FunilDaLista[];
  pipelineInicial: string | null;
  podeGerenciar: boolean;
  podeImportar: boolean;
}

/**
 * O quadro e a gestão vivem na mesma rota: trocar de funil não troca a shell,
 * enquanto criar, importar, renomear e arquivar seguem disponíveis logo abaixo.
 */
export function KanbanWorkspace({
  funis,
  pipelineInicial,
  podeGerenciar,
  podeImportar,
}: KanbanWorkspaceProps) {
  const router = useRouter();
  const selecionado = funis.find((funil) => funil.id === pipelineInicial)
    ?? funis.find((funil) => funil.is_default)
    ?? funis[0]
    ?? null;

  const trocarFunil = (id: string) => {
    router.replace(`/app/kanban?pipeline=${encodeURIComponent(id)}`, { scroll: false });
  };

  return (
    <div className="flex min-h-0 flex-col gap-6">
      {funis.length > 0 && (
        <div role="tablist" aria-label="Funis" className="flex gap-2 overflow-x-auto border-b border-border pb-2">
          {funis.map((funil) => {
            const ativo = funil.id === selecionado?.id;
            return (
              <Button
                key={funil.id}
                role="tab"
                type="button"
                variant="ghost"
                aria-selected={ativo}
                className={cn("shrink-0", ativo && "bg-surface font-semibold text-text")}
                onClick={() => trocarFunil(funil.id)}
              >
                {funil.name}
              </Button>
            );
          })}
        </div>
      )}

      {selecionado ? (
        <PipelinePageClient key={selecionado.id} pipelineId={selecionado.id} initialName={selecionado.name} />
      ) : null}

      <details open={funis.length === 0} className="rounded-lg border border-border bg-surface p-4" data-testid="gerenciar-funis">
        <summary className="cursor-pointer font-medium">Gerenciar funis</summary>
        <div className="mt-4">
          <FunisClient funis={funis} podeGerenciar={podeGerenciar} podeImportar={podeImportar} />
        </div>
      </details>
    </div>
  );
}
