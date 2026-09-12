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
            ? "w-full justify-start gap-3 rounded-xl border-white/10 bg-white/7 text-white/70 hover:bg-white/12 hover:text-white"
            : "gap-2 rounded-full bg-surface text-muted-foreground md:w-full md:max-w-xs md:justify-start",
          className,
        )}
        onClick={() => setOpen(true)}
        aria-label={sidebar ? t("Pesquisar") : undefined}
      >
        <MagnifyingGlass size={14} aria-hidden />
        <span className={sidebar ? "inline" : "hidden md:inline"}>
          {t(sidebar ? "Pesquisar" : "Buscar...")}
        </span>
        <kbd className={cn("ml-auto rounded-md border px-1.5 py-0.5 text-[10px]", sidebar ? "border-white/10 bg-white/6" : "hidden bg-muted md:inline")}>
          ⌘K
        </kbd>
      </Button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
}
