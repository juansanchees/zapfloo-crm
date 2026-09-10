import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { AreaNavigation } from "@/components/shell/AreaNavigation";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";

const authRef: { user: Pick<AuthUser, "is_platform_admin">; activeOrg: ActiveOrg | null } = {
  user: { is_platform_admin: false },
  activeOrg: { orgId: "org-1", name: "Org", role: "admin" },
};
const pathRef = { current: "/app/radar" };

vi.mock("@/hooks/auth/AuthProvider", () => ({ useAuth: () => authRef }));
vi.mock("next/navigation", () => ({ usePathname: () => pathRef.current }));

afterEach(() => {
  cleanup();
  pathRef.current = "/app/radar";
  authRef.activeOrg = { orgId: "org-1", name: "Org", role: "admin" };
});

describe("navegação contextual da área", () => {
  it("abre a operação de Leads e mantém a gestão de Funis em uma aba separada", () => {
    pathRef.current = "/app/pipelines/funil-1";
    render(<AreaNavigation />);

    expect(screen.getByRole("link", { name: "Leads" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Funis" })).toHaveAttribute("href", "/app/kanban");
    expect(screen.getByRole("link", { name: "Funis" })).not.toHaveAttribute("aria-current");
  });

  it("deixa a troca de funil disponível para viewer sem oferecer configuração de etapas", () => {
    pathRef.current = "/app/pipelines/funil-1";
    authRef.activeOrg = { orgId: "org-1", name: "Org", role: "viewer" };
    render(<AreaNavigation />);

    expect(screen.getByRole("link", { name: "Funis" })).toHaveAttribute("href", "/app/kanban");
    expect(screen.queryByRole("link", { name: "Etapas do funil" })).toBeNull();
  });

  it("reúne Radar e Respostas rápidas dentro de Conversas", () => {
    render(<AreaNavigation />);

    const nav = screen.getByRole("navigation", { name: /Conversas/ });
    expect(Array.from(nav.querySelectorAll("a")).map((link) => link.textContent)).toEqual([
      "Conversas",
      "Precisam de atenção",
      "Respostas rápidas",
    ]);
    expect(screen.getByRole("link", { name: "Precisam de atenção" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("filtra cada atalho de Configurações pelo papel", () => {
    pathRef.current = "/app/settings";
    authRef.activeOrg = { orgId: "org-1", name: "Org", role: "viewer" };
    render(<AreaNavigation />);

    expect(screen.getByRole("link", { name: "Empresa e equipe" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Conta e segurança" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Conexões" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Integrações" })).toBeNull();
  });

  it("não cria uma barra vazia em área sem opções secundárias", () => {
    pathRef.current = "/app/contacts";
    render(<AreaNavigation />);

    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
