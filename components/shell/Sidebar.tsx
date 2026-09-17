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
import { useConversationCounts } from "@/hooks/inbox/useConversationCounts";
import { useMarcaDaInstalacao } from "@/lib/branding/contexto";
import { compactAreaForPath, compactAreas, type CompactArea } from "@/lib/navigation/registry";
import { CaretDoubleLeft, CaretDoubleRight, Sparkle } from "@/lib/ui/icons";
import { roleAtLeast } from "@/lib/auth/types";
import { cn } from "@/lib/utils";

interface SidebarContentProps {
  collapsed: boolean;
  showCollapseControl?: boolean;
  onNavigate?: () => void;
}

/**
 * Nove portas visíveis para o produto inteiro.
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
  const { data: counts } = useConversationCounts(activeOrg?.orgId ?? null);
  const areas = compactAreas(user.is_platform_admin, activeOrg?.role ?? null);
  const areaAtiva = compactAreaForPath(pathname, areas);
  const principais = areas.filter((area) => area.position === "main");
  const secoes = [
    { id: "operacao" as const, label: "Operação" },
    { id: "equipe" as const, label: "Equipe" },
    { id: "administracao" as const, label: "Administração" },
  ];
  const fila = counts?.fila ?? counts?.unassigned;
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
        aria-label={t(area.label)}
        aria-current={ativa ? "page" : undefined}
        onClick={onNavigate}
        className={cn(
          "relative flex min-h-9 items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-transparent before:content-['']",
          ativa
            ? "bg-accent-900 text-accent-200 before:bg-accent"
            : "text-neutral-300 hover:bg-neutral-900 hover:text-text",
          collapsed && "justify-center px-2",
        )}
      >
        <Icon size={19} weight={ativa ? "fill" : "regular"} aria-hidden />
        {!collapsed && <span className="truncate">{t(area.label)}</span>}
        {!collapsed && area.id === "conversas" && fila !== undefined && (
          <span
            aria-label={`${fila} ${t("na fila")}`}
            className="ml-auto rounded-full bg-accent-800 px-1.5 py-0.5 text-[10.5px] leading-none font-medium text-accent-100"
          >
            {fila}
          </span>
        )}
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
          "border-divider flex h-14 items-center border-b px-4",
          collapsed ? "justify-center" : "justify-start",
        )}
      >
        {logo && !collapsed ? (
          // URL administrável em runtime; next/image exigiria allowlist no build.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={nomeDaMarca} className="h-9 w-auto max-w-[10rem] object-contain" />
        ) : (
          <span
            className={cn(
              "text-[17px] font-medium tracking-[-0.01em] text-text",
              collapsed && "sr-only",
            )}
          >
            {nomeDaMarca}
          </span>
        )}
        {collapsed && (
          <span aria-hidden className="text-lg font-medium text-accent-200">
            {[...nomeDaMarca][0]?.toUpperCase() ?? brand.initial}
          </span>
        )}
      </div>

      {activeOrg && !collapsed && (
        <div className="px-3 pt-3">
          <div className="border-divider flex min-w-0 items-center gap-3 rounded-lg border bg-surface p-2">
            <span
              aria-hidden
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent-800 text-xs font-medium text-accent-100"
            >
              {[...nomeDaEmpresa][0]?.toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] font-medium text-text">
                {nomeDaEmpresa}
              </span>
              <span className="block text-[10.5px] text-neutral-400">{t("Sua empresa")}</span>
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
              "flex min-h-9 items-center gap-3 rounded-lg border border-accent bg-transparent px-3 py-2 text-[13px] font-medium text-accent transition-colors hover:bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] active:bg-[color-mix(in_srgb,var(--color-accent)_22%,transparent)]",
              collapsed && "justify-center px-2",
            )}
          >
            <Sparkle size={19} weight="fill" aria-hidden />
            {!collapsed && <span className="truncate">{t("Pergunte à IA")}</span>}
          </Link>
        </div>
      )}

      <nav
        className="flex-1 [scrollbar-width:thin] [scrollbar-color:var(--color-neutral-800)_transparent] overflow-y-auto px-3 pt-0.5 pb-3 [&::-webkit-scrollbar]:w-[10px] [&::-webkit-scrollbar-thumb]:rounded-[8px] [&::-webkit-scrollbar-thumb]:bg-neutral-800 [&::-webkit-scrollbar-track]:bg-transparent"
        aria-label={t("Navegação principal")}
      >
        {secoes.map((secao) => {
          const itens = principais.filter((area) => area.section === secao.id);
          if (itens.length === 0) return null;
          return (
            <div key={secao.id} className="space-y-0.5">
              {!collapsed && (
                <h2 className="px-2 pt-3.5 pb-1.5 text-[10px] font-medium tracking-[0.14em] text-neutral-500 uppercase">
                  {t(secao.label)}
                </h2>
              )}
              {itens.map(linkDaArea)}
            </div>
          );
        })}
      </nav>

      <div className="border-divider shrink-0 border-t px-3 pt-2.5 pb-3.5">
        <VersionFooter collapsed={collapsed} onNavigate={onNavigate} />
        {showCollapseControl && (
          <button
            type="button"
            onClick={() => startTransition(() => toggleSidebar(collapsed))}
            disabled={isPending}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-text",
              collapsed && "justify-center px-2",
            )}
            aria-label={collapsed ? t("Expandir sidebar") : t("Recolher sidebar")}
          >
            {collapsed ? (
              <CaretDoubleRight size={14} aria-hidden />
            ) : (
              <CaretDoubleLeft size={14} aria-hidden />
            )}
            {!collapsed && <span>{t("Recolher menu")}</span>}
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
        "border-divider sticky top-0 z-30 flex h-screen shrink-0 flex-col border-r bg-[linear-gradient(180deg,var(--color-accent-900)_0%,var(--color-bg)_42%)] text-[13.5px] text-text shadow-lg transition-[width] duration-[220ms] ease-[ease]",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <SidebarContent collapsed={collapsed} />
    </aside>
  );
}
