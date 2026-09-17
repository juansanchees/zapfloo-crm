"use client";
import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { MagnifyingGlass } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { cn } from "@/lib/utils";

export function SearchTrigger({
  sidebar = false,
  className,
}: {
  sidebar?: boolean;
  className?: string;
} = {}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  // `enableOnFormTags`: o atalho precisa funcionar com o cursor dentro do
  // composer do inbox, que é onde o operador passa o dia.
  useHotkeys("mod+k", () => setOpen(true), { preventDefault: true, enableOnFormTags: true });

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={cn(
          sidebar
            ? "border-divider h-9 w-full justify-start gap-3 rounded-full bg-surface px-3 text-neutral-400 hover:border-accent-600 hover:bg-surface hover:text-text"
            : "border-divider h-9 gap-2 rounded-full bg-surface text-muted-foreground hover:border-accent-600 hover:bg-surface md:w-full md:max-w-xs md:justify-start",
          className,
        )}
        onClick={() => setOpen(true)}
        aria-label={sidebar ? t("Pesquisar") : undefined}
      >
        <MagnifyingGlass size={14} aria-hidden />
        <span className={sidebar ? "inline" : "hidden md:inline"}>
          {t(sidebar ? "Pesquisar" : "Buscar...")}
        </span>
        <kbd
          className={cn(
            "border-divider ml-auto rounded-sm border px-1 py-0.5 text-[10px]",
            sidebar ? "text-neutral-400" : "hidden text-text-muted md:inline",
          )}
        >
          ⌘K
        </kbd>
      </Button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}
