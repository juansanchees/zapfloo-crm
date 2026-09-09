"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/hooks/i18n/useT";
import {
  type DashboardLayout,
  type DashboardWidgetId,
  type DashboardWidgetSize,
  WIDGET_CATALOG,
  moveDashboardWidget,
  reorderDashboardWidget,
  resizeDashboardWidget,
} from "@/lib/dashboard/preferences";
import { CaretDown, CaretUp, DotsThree } from "@/lib/ui/icons";

const SIZE_LABEL: Record<DashboardWidgetSize, string> = {
  small: "Pequeno",
  medium: "Médio",
  wide: "Largo",
  full: "Linha inteira",
};

interface DashboardCustomizerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layout: DashboardLayout;
  saving: boolean;
  resetting: boolean;
  onSave: (layout: DashboardLayout) => Promise<unknown>;
  onReset: () => Promise<unknown>;
}

export function DashboardCustomizer({
  open,
  onOpenChange,
  layout,
  saving,
  resetting,
  onSave,
  onReset,
}: DashboardCustomizerProps) {
  const t = useT();
  const [draft, setDraft] = useState(layout);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);

  function patchWidget(id: string, patch: Partial<DashboardLayout["widgets"][number]>) {
    setDraft((current) => ({
      ...current,
      widgets: current.widgets.map((widget) =>
        widget.id === id ? { ...widget, ...patch, id: widget.id } : widget,
      ),
    }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("Personalizar painel")}</DialogTitle>
          <DialogDescription>
            {t("Escolha o que aparece, o tamanho dos blocos e a ordem do seu painel.")}
          </DialogDescription>
        </DialogHeader>

        <div className="divide-y rounded-xl border">
          {draft.widgets.map((widget, index) => {
            const id = widget.id as DashboardWidgetId;
            const definition = WIDGET_CATALOG[id];
            if (!definition) return null;
            return (
              <div
                key={id}
                data-testid={`dashboard-editor-${id}`}
                draggable
                onDragStart={(event) => {
                  if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", id);
                  }
                  setDraggingId(id);
                }}
                onDragEnd={() => setDraggingId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const sourceId = event.dataTransfer?.getData("text/plain") || draggingId;
                  if (sourceId) setDraft((current) => reorderDashboardWidget(current, sourceId, id));
                  setDraggingId(null);
                }}
                className="grid cursor-grab gap-3 p-4 transition-colors hover:bg-muted/40 active:cursor-grabbing sm:grid-cols-[auto_1fr_10rem_auto] sm:items-center"
              >
                <span className="hidden text-muted-foreground sm:block" aria-hidden>
                  <DotsThree size={22} weight="bold" />
                </span>
                <label className="flex min-w-0 items-start gap-3">
                  <Switch
                    checked={widget.visible}
                    onCheckedChange={(visible) => patchWidget(id, { visible })}
                    aria-label={`${t("Exibir")} ${t(definition.label)}`}
                  />
                  <span className="min-w-0">
                    <strong className="block text-sm font-medium">{t(definition.label)}</strong>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {t(definition.description)}
                    </span>
                  </span>
                </label>
                <div className="min-w-0 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>{t("Tamanho")}</span>
                    <span>{t(SIZE_LABEL[widget.size as DashboardWidgetSize])}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={definition.allowedSizes.length - 1}
                    step={1}
                    value={Math.max(0, definition.allowedSizes.indexOf(widget.size as never))}
                    onChange={(event) =>
                      setDraft((current) => resizeDashboardWidget(current, id, Number(event.target.value)))
                    }
                    aria-label={`${t("Redimensionar")} ${t(definition.label)}`}
                    className="h-2 w-full cursor-ew-resize accent-[var(--color-accent)]"
                  />
                </div>
                <div className="flex justify-end gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={index === 0}
                    onClick={() => setDraft((current) => moveDashboardWidget(current, id, "up"))}
                    aria-label={`${t("Mover para cima")} ${t(definition.label)}`}
                  >
                    <CaretUp aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={index === draft.widgets.length - 1}
                    onClick={() => setDraft((current) => moveDashboardWidget(current, id, "down"))}
                    aria-label={`${t("Mover para baixo")} ${t(definition.label)}`}
                  >
                    <CaretDown aria-hidden />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {operationError && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {operationError}
          </p>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            disabled={saving || resetting}
            onClick={async () => {
              setOperationError(null);
              try {
                await onReset();
                onOpenChange(false);
              } catch {
                setOperationError(t("Não foi possível restaurar o painel."));
              }
            }}
          >
            {t("Restaurar padrão")}
          </Button>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("Cancelar")}
            </Button>
            <Button
              type="button"
              disabled={saving || resetting}
              onClick={async () => {
                setOperationError(null);
                try {
                  await onSave(draft);
                  onOpenChange(false);
                } catch {
                  setOperationError(t("Não foi possível salvar o painel."));
                }
              }}
            >
              {saving ? t("Salvando…") : t("Salvar painel")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
