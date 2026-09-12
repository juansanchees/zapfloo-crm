import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  trend?: ReactNode;
  className?: string;
}

/** Métrica compacta, sempre alinhada à esquerda e com contexto textual. */
export function MetricCard({ label, value, detail, icon, trend, className }: MetricCardProps) {
  return (
    <article
      aria-label={label}
      className={cn("rounded-xl border border-border bg-panel p-4 shadow-xs", className)}
    >
      <div className="flex items-center justify-between gap-3 text-xs font-medium text-text-muted">
        <span>{label}</span>
        {icon && <span className="text-accent">{icon}</span>}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <strong className="text-2xl font-semibold tracking-[-0.04em] text-text tabular-nums">
          {value}
        </strong>
        {trend && <span className="text-xs font-medium text-success">{trend}</span>}
      </div>
      {detail && <p className="mt-1 text-xs leading-5 text-text-muted">{detail}</p>}
    </article>
  );
}
