import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { Sidebar } from "@/components/shell/Sidebar";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";

const authRef: { user: Pick<AuthUser, "is_platform_admin">; activeOrg: ActiveOrg | null } = {
  user: { is_platform_admin: false },
  activeOrg: null,
};
const pathRef = { current: "/app/inbox" };

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
vi.mock("@/app/actions/shell/toggleSidebar", () => ({
  toggleSidebar: vi.fn(),
}));
vi.mock("@/components/shell/VersionFooter", () => ({
  VersionFooter: () => null,
}));

function comoPapel(role: ActiveOrg["role"]) {
  authRef.user = { is_platform_admin: false };
  authRef.activeOrg = { orgId: "org-1", name: "Org", role };
}

afterEach(() => {
  cleanup();
  pathRef.current = "/app/inbox";
});

describe("Sidebar compacto", () => {
  it("organiza as portas reais em operação e crescimento", () => {
    comoPapel("admin");
    render(<Sidebar collapsed={false} />);

    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    expect(Array.from(nav.querySelectorAll("a")).map((link) => link.textContent?.trim())).toEqual([
      "Painel de controle",
      "Conversas",
      "Calendário",
      "Contatos",
      "Leads",
      "Agentes de IA",
      "Automações",
      "Relatórios",
    ]);
    expect(screen.getByText("Crescimento")).toBeVisible();
    expect(screen.getByRole("link", { name: "Configurações" })).toHaveAttribute(
      "href",
      "/app/settings",
    );
  });

  it("remove atalhos secundários e usa Leads para a operação do funil", () => {
    comoPapel("admin");
    render(<Sidebar collapsed={false} />);

    expect(screen.queryByRole("link", { name: "Radar" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Tarefas" })).toBeNull();
    expect(screen.getByRole("link", { name: "Leads" })).toHaveAttribute("href", "/app/kanban");
    expect(screen.getByRole("link", { name: "Automações" })).toHaveAttribute(
      "href",
      "/app/ai/followups",
    );
  });

  it("destaca Pergunte à IA como ação global, sem criar uma nona porta", () => {
    comoPapel("agent");
    render(<Sidebar collapsed={false} />);

    expect(screen.getByRole("link", { name: "Pergunte à IA" })).toHaveAttribute(
      "href",
      "/app/ai/ask",
    );
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    expect(nav.contains(screen.getByRole("link", { name: "Pergunte à IA" }))).toBe(false);
  });

  it("mantém os dois itens de rodapé fora da área rolável", () => {
    comoPapel("admin");
    render(<Sidebar collapsed={false} />);

    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    expect(nav.contains(screen.getByRole("link", { name: "Calendário" }))).toBe(true);
    expect(nav.contains(screen.getByRole("link", { name: "Configurações" }))).toBe(false);
  });

  it("destaca a área pai quando a rota aberta é secundária", () => {
    comoPapel("admin");
    pathRef.current = "/app/radar";
    render(<Sidebar collapsed={false} />);

    expect(screen.getByRole("link", { name: "Conversas" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Painel de controle" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("move Tarefas para a área Agenda", () => {
    comoPapel("admin");
    pathRef.current = "/app/tasks";
    render(<Sidebar collapsed={false} />);

    expect(screen.getByRole("link", { name: "Calendário" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Leads" })).not.toHaveAttribute("aria-current");
  });

  it("não mostra Agentes de IA abaixo de manager", () => {
    comoPapel("agent");
    render(<Sidebar collapsed={false} />);

    expect(screen.queryByRole("link", { name: "Agentes de IA" })).toBeNull();
    expect(screen.getByRole("link", { name: "Conversas" })).toBeVisible();
  });

  it("recolhido mantém todas as portas com nome acessível", () => {
    comoPapel("admin");
    render(<Sidebar collapsed />);

    expect(screen.getByRole("link", { name: "Conversas" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Configurações" })).toBeVisible();
  });

  it("mantém a casca presa à viewport durante o scroll", () => {
    comoPapel("admin");
    const { container } = render(<Sidebar collapsed={false} />);

    const aside = container.querySelector("aside");
    expect(aside).toHaveClass("sticky", "top-0", "h-screen");
  });
});
