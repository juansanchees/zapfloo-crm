import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  platformAdmin: false,
  role: "viewer" as "viewer" | "agent" | "manager" | "admin",
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (href: string) => {
    state.redirect(href);
    throw new Error("NEXT_REDIRECT");
  },
}));

vi.mock("@/lib/auth/server", () => ({
  requireAuth: async () => ({ id: "user-1", is_platform_admin: state.platformAdmin }),
  resolveActiveOrg: async () => ({ orgId: "org-1", name: "Org", role: state.role }),
}));

vi.mock("@/app/app/metas/_components/MetasClient", () => ({
  MetasClient: ({ canManage, role }: { canManage: boolean; role: string }) => (
    <div data-testid="metas-client" data-can-manage={String(canManage)} data-role={role} />
  ),
}));

import MetasPage from "@/app/app/metas/page";

beforeEach(() => {
  state.platformAdmin = false;
  state.role = "viewer";
  state.redirect.mockClear();
});

describe("porta da tela de Metas", () => {
  it("permite admin de plataforma com membership viewer", async () => {
    state.platformAdmin = true;
    state.role = "viewer";

    render(await MetasPage());

    expect(state.redirect).not.toHaveBeenCalled();
    expect(screen.getByTestId("metas-client")).toHaveAttribute("data-role", "viewer");
    expect(screen.getByTestId("metas-client")).toHaveAttribute("data-can-manage", "true");
  });

  it("continua recusando viewer de tenant sem privilégio de plataforma", async () => {
    await expect(MetasPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(state.redirect).toHaveBeenCalledWith("/app");
  });
});
