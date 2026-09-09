"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { compactAreaForPath, compactAreas } from "@/lib/navigation/registry";
import { cn } from "@/lib/utils";

/** Segunda camada do menu compacto: aparece apenas onde há escolhas irmãs. */
export function AreaNavigation() {
  const pathname = usePathname();
  const { user, activeOrg } = useAuth();
  const t = useT();
  const areas = compactAreas(user.is_platform_admin, activeOrg?.role ?? null);
  const area = compactAreaForPath(pathname, areas);

  if (!area || area.tabs.length < 2) return null;

  const tabAtiva = [...area.tabs]
    .filter((tab) => {
      // "Visão geral" é o hub da área e só fica ativo na sua própria URL.
      if (tab.label === "Visão geral") return pathname === tab.href;
      return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
    })
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <div className="border-b bg-surface/90 px-4 backdrop-blur md:px-6">
      <nav
        aria-label={`${t(area.label)} — ${t("Opções da área")}`}
        className="scrollbar-none flex min-w-0 gap-1 overflow-x-auto py-2"
      >
        {area.tabs.map((tab) => {
          const ativa = tabAtiva?.href === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={ativa ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors md:text-sm",
                ativa
                  ? "bg-accent text-accent-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground",
              )}
            >
              {t(tab.label)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
