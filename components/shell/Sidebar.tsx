"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";

import { toggleSidebar } from "@/app/actions/shell/toggleSidebar";
import { ConnectionHealthDot } from "@/components/connections/ConnectionHealthDot";
import { VersionFooter } from "@/components/shell/VersionFooter";
import { SearchTrigger } from "@/components/shell/SearchTrigger";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { useMarcaDaInstalacao } from "@/lib/branding/contexto";
import { compactAreaForPath, compactAreas, type CompactArea } from "@/lib/navigation/registry";
import { Brain, CaretDoubleLeft, CaretDoubleRight } from "@/lib/ui/icons";
import { roleAtLeast } from "@/lib/auth/types";
import { cn } from "@/lib/utils";

interface SidebarContentProps {
  collapsed: boolean;
  showCollapseControl?: boolean;
  onNavigate?: () => void;
}

/**
 * Oito portas para o produto inteiro.
 *
 * O componente só desenha a projeção de `compactAreas()`: permissões, rotas e
 * ordem continuam decididas no registro canônico. As telas secundárias ficam
 * na barra contextual, nos hubs e no ⌘K — simplificar o menu não apaga nada.
 */
export function SidebarContent({
  collapsed,
  showCollapseControl = true,
  onNavigate,
}: SidebarContentProps) {
  const t = useT();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const { user, activeOrg } = useAuth();
  const areas = compactAreas(user.is_platform_admin, activeOrg?.role ?? null);
  const areaAtiva = compactAreaForPath(pathname, areas);
  const principais = areas.filter((area) => area.position === "main");
  const operacao = principais.filter((area) => area.section === "operacao");
  const crescimento = principais.filter((area) => area.section === "crescimento");
  const rodape = areas.filter((area) => area.position === "footer");
  const canAsk = user.is_platform_admin || (!!activeOrg && roleAtLeast(activeOrg.role, "agent"));

  const brand = useMarcaDaInstalacao();
  const nomeDaMarca = activeOrg?.marca?.nome ?? brand.name;
  const nomeDaEmpresa = activeOrg?.name ?? t("Sua empresa");
  // Vazio é ausência de logo: desce para a marca da instalação.
  const logo = activeOrg?.marca?.logoUrl || brand.logoUrl;

  function linkDaArea(area: CompactArea) {
    const ativa = areaAtiva?.id === area.id;
    const Icon = area.icon;

    return (
      <Link
        key={area.id}
        href={area.href}
        title={collapsed ? t(area.label) : undefined}
        aria-current={ativa ? "page" : undefined}
        onClick={onNavigate}
        className={cn(
          "relative flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
          ativa
            ? "bg-accent text-accent-foreground shadow-sm"
            : "text-white/70 hover:bg-white/10 hover:text-white",
          collapsed && "justify-center px-2",
        )}
      >
        <Icon size={19} weight={ativa ? "fill" : "regular"} aria-hidden />
        {!collapsed && <span className="truncate">{t(area.label)}</span>}
        {area.healthDot && (
          <ConnectionHealthDot
            className={cn(collapsed ? "absolute top-1.5 right-1.5" : "ml-auto")}
          />
        )}
      </Link>
    );
  }

  return (
    <>
      <div
        className={cn(
          "flex h-16 items-center border-b border-white/10 px-4",
          collapsed ? "justify-center" : "justify-start",
        )}
      >
        {logo && !collapsed ? (
          // URL administrável em runtime; next/image exigiria allowlist no build.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt={nomeDaMarca}
            className="h-9 w-auto max-w-[10rem] object-contain"
          />
        ) : (
          <span className={cn("font-semibold tracking-tight", collapsed && "sr-only")}>{nomeDaMarca}</span>
        )}
        {collapsed && (
          <span aria-hidden className="text-lg font-bold text-white">
            {[...nomeDaMarca][0]?.toUpperCase() ?? brand.initial}
          </span>
        )}
      </div>

      {activeOrg && !collapsed && (
        <div className="px-3 pt-3">
          <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/8 bg-white/7 p-3">
            <span
              aria-hidden
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/20 text-sm font-bold text-accent"
            >
              {[...nomeDaEmpresa][0]?.toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white">{nomeDaEmpresa}</span>
              <span className="block text-[11px] text-white/50">{t("Sua empresa")}</span>
            </span>
          </div>
        </div>
      )}

      {!collapsed && (
        <div className="px-3 pt-2">
          <SearchTrigger sidebar />
        </div>
      )}

      {canAsk && (
        <div className="px-3 pt-3">
          <Link
            href="/app/ai/ask"
            title={collapsed ? t("Pergunte à IA") : undefined}
            aria-label={collapsed ? t("Pergunte à IA") : undefined}
            onClick={onNavigate}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-accent-foreground shadow-xs transition-[filter,transform] hover:brightness-105 active:translate-y-px",
              collapsed && "justify-center px-2",
            )}
          >
            <Brain size={19} weight="fill" aria-hidden />
            {!collapsed && <span className="truncate">{t("Pergunte à IA")}</span>}
          </Link>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto p-3" aria-label={t("Navegação principal")}>
        <div className="space-y-1">{operacao.map(linkDaArea)}</div>
        {crescimento.length > 0 && (
          <div className="mt-4 space-y-1">
            {!collapsed && (
              <h2 className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">
                {t("Crescimento")}
              </h2>
            )}
            {crescimento.map(linkDaArea)}
          </div>
        )}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="mb-1 space-y-1">{rodape.map(linkDaArea)}</div>
        <VersionFooter collapsed={collapsed} onNavigate={onNavigate} />
        {showCollapseControl && (
          <button
            type="button"
            onClick={() => startTransition(() => toggleSidebar(collapsed))}
            disabled={isPending}
            className={cn(
              "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-white/55 transition-colors hover:bg-white/10 hover:text-white",
              collapsed && "justify-center px-2",
            )}
            aria-label={collapsed ? t("Expandir sidebar") : t("Recolher sidebar")}
          >
            {collapsed ? (
              <CaretDoubleRight size={14} aria-hidden />
            ) : (
              <CaretDoubleLeft size={14} aria-hidden />
            )}
            {!collapsed && <span>{t("Recolher")}</span>}
          </button>
        )}
      </div>
    </>
  );
}

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <aside
      className={cn(
        "sticky top-0 z-30 flex h-screen shrink-0 flex-col border-r border-white/10 bg-shell text-white shadow-xl transition-[width] duration-200",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <SidebarContent collapsed={collapsed} />
    </aside>
  );
}
