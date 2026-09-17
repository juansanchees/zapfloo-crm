"use client";
import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/hooks/i18n/useT";
import { useBoard } from "@/hooks/kanban/useBoard";

function formatError(err: unknown, t: (texto: string) => string): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const obj = err as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
    if (typeof obj.message === "string") {
      const code = typeof obj.code === "string" ? ` [${obj.code}]` : "";
      return `${obj.message}${code}`;
    }
    try {
      return JSON.stringify(err);
    } catch {
      return t("Erro desconhecido");
    }
  }
  return String(err);
}
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { FilterBar } from "@/components/kanban/FilterBar";
import { BulkActionBar } from "@/components/kanban/BulkActionBar";
import { NewLeadDialog } from "@/components/kanban/NewLeadDialog";
import { Button } from "@/components/ui/button";
import { Plus } from "@/lib/ui/icons";
import type { LeadFilters } from "@/lib/kanban/filters";
import { applyFilters, filtersFromParams, filtersToParams } from "@/lib/kanban/filters";
import type { CurrencyTotals } from "@/lib/kanban/summary";
import { usePermission } from "@/hooks/auth/AuthProvider";

function TotaisPorMoeda({ valores }: { valores: CurrencyTotals }) {
  const t = useT();
  const entries = Object.entries(valores);
  if (entries.length === 0) return <span className="text-text-muted">{t("Sem valores")}</span>;
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-1 tabular-nums">
      {entries.map(([currency, cents]) => {
        let valor: string;
        try {
          valor = new Intl.NumberFormat("pt-BR", {
            style: "currency", currency, maximumFractionDigits: 0,
          }).format(cents / 100);
        } catch {
          valor = `${(cents / 100).toFixed(0)} ${currency}`;
        }
        return <span key={currency}>{valor}</span>;
      })}
    </span>
  );
}

export function PipelinePageClient({
  pipelineId,
  initialName,
}: {
  pipelineId: string;
  initialName: string;
}) {
  const t = useT();
  const { data, isLoading, error, pulses, realtimeStatus, seguranca } = useBoard(pipelineId);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams]);
  const setFilters = useCallback(
    (next: LeadFilters) => {
      // `pipeline` e `lead` escolhem contexto do workspace, não são filtros.
      // Apagá-los ao filtrar trocava silenciosamente a aba ativa pelo default.
      const params = new URLSearchParams(searchParams.toString());
      for (const key of ["owner", "status", "tag", "q", "overdue"]) params.delete(key);
      for (const [key, value] of new URLSearchParams(filtersToParams(next))) params.set(key, value);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );
  const canMutate = usePermission("pipeline.move_card");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newOpen, setNewOpen] = useState(false);

  const filteredLeads = data ? applyFilters(data.leads, filters) : [];

  return (
    <div
      className="flex h-full flex-col gap-4"
      // OBSERVÁVEL de propósito, e é a razão de existir desta linha: "a
      // assinatura morreu" e "nada aconteceu" produzem o MESMO silêncio na
      // tela, e sem este valor nem o produto nem o teste conseguem separar as
      // duas famílias de causa. Com ele, quem investiga olha DURANTE a rodada
      // que falha: `subscribed` manda procurar a montante (entrega, filtro, ou
      // o evento nunca saiu); `channel_error`/`timed_out`/`closed` já é a
      // resposta.
      //
      // Ainda NÃO religa — religar é desenho e merece bloco próprio. Isto aqui
      // é só parar de descartar o que já era calculado.
      data-realtime-status={realtimeStatus.toLowerCase()}
      // A rede de segurança fica OBSERVÁVEL pelo mesmo motivo do status do
      // canal: "a entrega morreu" e "nada aconteceu" têm a mesma aparência, que
      // é silêncio. Aqui o número de divergências é a diferença entre os dois —
      // e é o sinal que faltava para uma verificação poder APROVAR, e não só
      // reprovar.
      data-refetch-divergencias={seguranca.divergencias}
      data-refetch-em={seguranca.ultimaVerificacao ?? ""}
    >
      {/* `flex-col` no mobile: nome de funil comprido (é texto livre, sem
          limite curto) + botão na mesma linha sem quebra empurrava o botão pra
          fora da viewport em telas estreitas. De `sm:` pra cima volta a ser
          uma linha só, como sempre foi. */}
      <header className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {data?.pipeline.name ?? initialName}
          </h1>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs">
            <p><span className="mr-1 text-text-muted">{t("Pipeline aberto")}</span><TotaisPorMoeda valores={data?.summary?.open_by_currency ?? {}} /></p>
            <p><span className="mr-1 text-text-muted">{t("Ganho no mês")}</span><TotaisPorMoeda valores={data?.summary?.won_month_by_currency ?? {}} /></p>
          </div>
        </div>
        <Button onClick={() => setNewOpen(true)} disabled={!data} className="shrink-0">
          <Plus size={16} className="mr-2" /> {t("Novo negócio")}
        </Button>
      </header>
      {seguranca.divergencias > 0 && (
        <p role="status" className="rounded-lg border border-warning/30 bg-warning-bg p-3 text-sm text-warning-fg">
          {t("Uma atualização não chegou em tempo real. Recuperamos os dados pela verificação de segurança; novas alterações podem demorar para aparecer.")}
        </p>
      )}
      {data && (
        <NewLeadDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          pipelineId={pipelineId}
          stages={data.stages}
        />
      )}
      <FilterBar filters={filters} onChange={setFilters} leads={data?.leads ?? []} />
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm">
          {t("Não consegui carregar este funil:")} {formatError(error, t)}
        </div>
      ) : isLoading || !data ? (
        <div className="flex flex-1 animate-pulse items-center justify-center text-muted-foreground">
          {t("Carregando…")}
        </div>
      ) : (
        <KanbanBoard
          pipelineId={pipelineId}
          stages={data.stages}
          leads={filteredLeads}
          pulses={pulses}
          pipeline={data.pipeline}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          leadInicial={searchParams.get("lead")}
        />
      )}
      {canMutate && <BulkActionBar
        selectedIds={selectedIds}
        stages={data?.stages ?? []}
        pipelineId={pipelineId}
        vocabulary={data?.pipeline.vocabulary ?? null}
        onClear={() => setSelectedIds([])}
      />}
    </div>
  );
}
