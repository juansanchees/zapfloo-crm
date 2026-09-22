import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AreaNavigation } from "@/components/shell/AreaNavigation";
import { NavHub } from "@/components/shell/NavHub";
import { SidebarContent } from "@/components/shell/Sidebar";
import type { ActiveOrg, AuthUser, Role } from "@/lib/auth/types";
import { NAV_DESTINATIONS, NAV_GROUPS, canSee } from "@/lib/navigation/registry";

const authRef: { user: Pick<AuthUser, "is_platform_admin">; activeOrg: ActiveOrg | null } = {
  user: { is_platform_admin: false },
  activeOrg: null,
};
const pathRef = { current: "/app" };

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => authRef,
  usePermission: () => false,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => pathRef.current,
}));
vi.mock("@/components/connections/ConnectionHealthDot", () => ({
  ConnectionHealthDot: () => null,
}));
vi.mock("@/hooks/inbox/useConversationCounts", () => ({
  useConversationCounts: () => ({ data: { fila: 0, unassigned: 0, mine: 0, all: 0 } }),
}));
vi.mock("@/app/actions/shell/toggleSidebar", () => ({
  toggleSidebar: vi.fn(),
}));
vi.mock("@/components/shell/VersionFooter", () => ({
  VersionFooter: () => null,
}));

const PAPEIS: Role[] = ["viewer", "agent", "manager", "admin"];

function hrefs(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLAnchorElement>("a[href]")].map((link) =>
    link.getAttribute("href")!,
  );
}

/**
 * Percorre o DOM que a pessoa realmente recebe: porta do Sidebar -> abas da
 * area -> cards do hub. Busca e URL digitada ficam deliberadamente de fora.
 */
function caminhosPorClique(role: Role): Set<string> {
  authRef.activeOrg = { orgId: "org-1", name: "Org", role };
  pathRef.current = "/app";

  const sidebar = render(<SidebarContent collapsed={false} />);
  const navPrincipal = sidebar.getByRole("navigation", { name: "Navegação principal" });
  const rodapeFixo = sidebar.getByTestId("sidebar-persistent-footer");
  const alcançados = new Set([...hrefs(navPrincipal), ...hrefs(rodapeFixo)]);
  sidebar.unmount();

  // Cada porta principal pode desenhar uma segunda camada de links.
  for (const porta of [...alcançados]) {
    pathRef.current = porta;
    const area = render(<AreaNavigation />);
    for (const href of hrefs(area.container)) alcançados.add(href);
    area.unmount();
  }

  // Um hub alcançado desenha os cards permitidos para aquele papel.
  for (const group of NAV_GROUPS) {
    if (!group.hub || !alcançados.has(group.hub.href)) continue;
    const hub = render(
      <NavHub
        group={group.id}
        isPlatformAdmin={false}
        role={role}
        title={group.label}
        subtitle=""
      />,
    );
    for (const href of hrefs(hub.container)) alcançados.add(href);
    hub.unmount();
  }

  return alcançados;
}

afterEach(() => {
  cleanup();
  authRef.activeOrg = null;
  pathRef.current = "/app";
});

describe("alcançabilidade real da navegação lateral", () => {
  it.each(PAPEIS)("%s chega por clique a todo destino que seu papel pode ver", (role) => {
    const alcançados = caminhosPorClique(role);
    const semPorta = NAV_DESTINATIONS.filter(
      (destination) => canSee(destination, false, role) && !alcançados.has(destination.href),
    ).map((destination) => destination.href);

    expect(
      semPorta,
      `${role}: destino visível sem caminho por clique a partir do menu lateral:\n  ${semPorta.join("\n  ")}`,
    ).toEqual([]);
  });
});
