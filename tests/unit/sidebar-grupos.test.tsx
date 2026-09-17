import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { Sidebar } from "@/components/shell/Sidebar";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";
import { Sparkle } from "@/lib/ui/icons";

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
vi.mock("@/hooks/inbox/useConversationCounts", () => ({
  useConversationCounts: () => ({ data: { fila: 7, unassigned: 7, mine: 2, all: 12 } }),
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
  it("organiza as portas reais em operação, equipe e administração", () => {
    comoPapel("admin");
    render(<Sidebar collapsed={false} />);

    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    expect(Array.from(nav.querySelectorAll("a")).map((link) => link.textContent?.trim())).toEqual([
      "Painel de controle",
      "Conversas7",
      "Funis de vendas",
      "Contatos",
      "Tarefas e agenda",
      "Relatórios",
      "Instâncias WhatsApp",
      "Usuários e permissões",
      "Plano e pagamentos",
    ]);
    expect(screen.getByText("Operação")).toBeVisible();
    expect(screen.getByText("Equipe")).toBeVisible();
    expect(screen.getByText("Administração")).toBeVisible();
    expect(screen.getByText("7")).toHaveAccessibleName("7 na fila");
  });

  it("remove atalhos secundários e usa Funis de vendas para a operação do funil", () => {
    comoPapel("admin");
    render(<Sidebar collapsed={false} />);

    expect(screen.queryByRole("link", { name: "Radar" })).toBeNull();
    expect(screen.getByRole("link", { name: "Funis de vendas" })).toHaveAttribute(
      "href",
      "/app/kanban",
    );
    expect(screen.getByRole("link", { name: "Tarefas e agenda" })).toHaveAttribute(
      "href",
      "/app/tasks",
    );
  });

  it("destaca Pergunte à IA como ação global, sem criar uma décima porta", () => {
    comoPapel("agent");
    render(<Sidebar collapsed={false} />);

    const chamada = screen.getByRole("link", { name: "Pergunte à IA" });
    expect(chamada).toHaveAttribute("href", "/app/ai/ask");
    const referencia = render(<Sparkle size={19} weight="fill" aria-hidden />);
    expect(chamada.querySelector("svg")?.outerHTML).toBe(
      referencia.container.querySelector("svg")?.outerHTML,
    );
    referencia.unmount();
    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    expect(nav.contains(chamada)).toBe(false);
  });

  it("mantém o controle de recolher no rodapé fora da área rolável", () => {
    comoPapel("admin");
    render(<Sidebar collapsed={false} />);

    const nav = screen.getByRole("navigation", { name: "Navegação principal" });
    expect(nav.contains(screen.getByRole("link", { name: "Plano e pagamentos" }))).toBe(true);
    expect(nav.contains(screen.getByRole("button", { name: "Recolher sidebar" }))).toBe(false);
    expect(screen.getByRole("button", { name: "Recolher sidebar" })).toHaveTextContent(
      "Recolher menu",
    );
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

  it("une Tarefas e Agenda numa única área", () => {
    comoPapel("admin");
    pathRef.current = "/app/tasks";
    render(<Sidebar collapsed={false} />);

    expect(screen.getByRole("link", { name: "Tarefas e agenda" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Funis de vendas" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("mantém Funis de vendas ativo dentro do quadro de oportunidades", () => {
    comoPapel("agent");
    pathRef.current = "/app/pipelines/funil-1";
    render(<Sidebar collapsed={false} />);

    expect(screen.getByRole("link", { name: "Funis de vendas" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("mantém as portas permitidas e oculta as administrativas acima do papel", () => {
    comoPapel("agent");
    render(<Sidebar collapsed={false} />);

    expect(screen.queryByRole("link", { name: "Instâncias WhatsApp" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Plano e pagamentos" })).toBeNull();
    expect(screen.getByRole("link", { name: "Usuários e permissões" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Conversas" })).toBeVisible();
  });

  it("recolhido mantém todas as portas com nome acessível", () => {
    comoPapel("admin");
    render(<Sidebar collapsed />);

    expect(screen.getByRole("link", { name: "Conversas" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Plano e pagamentos" })).toBeVisible();
  });

  it("aplica o gradiente, a marca ativa e a transição Nocturne", () => {
    comoPapel("admin");
    const { container } = render(<Sidebar collapsed={false} />);

    const aside = container.querySelector("aside");
    expect(aside).toHaveClass(
      "bg-shell",
      "bg-[linear-gradient(180deg,var(--color-accent-900)_0%,var(--color-bg)_42%)]",
      "duration-[220ms]",
      "[--color-bg:var(--color-shell)]",
      "[--color-surface:var(--color-neutral-900)]",
      "[--color-text:var(--color-neutral-100)]",
    );
    expect(screen.getByRole("link", { name: "Conversas" })).toHaveClass("before:bg-accent");
  });

  it("mantém a casca presa à viewport durante o scroll", () => {
    comoPapel("admin");
    const { container } = render(<Sidebar collapsed={false} />);

    const aside = container.querySelector("aside");
    expect(aside).toHaveClass("sticky", "top-0", "h-screen");
  });
});
