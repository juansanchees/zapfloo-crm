import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface OperationalPageProps {
  eyebrow?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

/** Estrutura compartilhada das telas de trabalho do CRM. */
export function OperationalPage({
  eyebrow,
  title,
  description,
  actions,
  toolbar,
  children,
  className,
  contentClassName,
}: OperationalPageProps) {
  return (
    <section className={cn("mx-auto flex h-full w-full max-w-[1500px] flex-col gap-5", className)}>
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-accent">
              {eyebrow}
            </p>
          )}
          <h1 className="text-2xl font-semibold tracking-[-0.035em] text-text">{title}</h1>
          {description && <p className="mt-1 max-w-3xl text-sm leading-6 text-text-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </header>

      {toolbar && (
        <div
          role="region"
          aria-label={`Ferramentas de ${title}`}
          className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-panel p-2.5 shadow-xs"
        >
          {toolbar}
        </div>
      )}

      <div className={cn("min-h-0 flex-1", contentClassName)}>{children}</div>
    </section>
  );
}
