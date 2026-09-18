import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  platformAdmin: true,
  role: "viewer" as "viewer" | "agent" | "manager" | "admin",
}));

const pipeline = {
  id: "pipeline-1",
  name: "Principal",
  slug: "principal",
  description: null,
  position: 1,
  is_default: true,
  vocabulary: {},
};

const query = {
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  maybeSingle: vi.fn(),
};
query.select.mockReturnValue(query);
query.eq.mockReturnValue(query);
query.order.mockResolvedValue({ data: [pipeline] });
query.maybeSingle.mockResolvedValue({ data: pipeline });

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => ({
  requireAuth: async () => ({ id: "platform-1", idioma: "pt-BR", is_platform_admin: state.platformAdmin }),
  resolveActiveOrg: async () => ({ orgId: "org-1", name: "Org", role: state.role }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => query }),
}));
vi.mock("@/lib/i18n/dicionario", () => ({ traduzir: (text: string) => text }));
vi.mock("@/components/ui/operational-page", () => ({
  OperationalPage: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/app/app/kanban/_components/KanbanWorkspace", () => ({
  KanbanWorkspace: ({ podeMover }: { podeMover: boolean }) => (
    <div data-testid="kanban-workspace" data-can-mutate={String(podeMover)} />
  ),
}));
vi.mock("@/app/app/pipelines/[id]/_client", () => ({
  PipelinePageClient: ({ canMutate }: { canMutate: boolean }) => (
    <div data-testid="pipeline-client" data-can-mutate={String(canMutate)} />
  ),
}));

import KanbanPickerPage from "@/app/app/kanban/page";
import PipelinePage from "@/app/app/pipelines/[id]/page";

beforeEach(() => {
  state.platformAdmin = true;
  state.role = "viewer";
  query.eq.mockClear();
});

describe("RBAC do quadro deriva do papel na organização ativa", () => {
  it("admin de plataforma com membership viewer vê o workspace sem escrita", async () => {
    render(await KanbanPickerPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByTestId("kanban-workspace")).toHaveAttribute("data-can-mutate", "false");
  });

  it("a rota direta do funil também preserva viewer como somente leitura", async () => {
    render(await PipelinePage({ params: Promise.resolve({ id: "pipeline-1" }) }));
    expect(screen.getByTestId("pipeline-client")).toHaveAttribute("data-can-mutate", "false");
  });

  it("agent+ recebe escrita nas duas entradas", async () => {
    state.platformAdmin = false;
    state.role = "agent";
    const { unmount } = render(await KanbanPickerPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByTestId("kanban-workspace")).toHaveAttribute("data-can-mutate", "true");
    unmount();
    render(await PipelinePage({ params: Promise.resolve({ id: "pipeline-1" }) }));
    expect(screen.getByTestId("pipeline-client")).toHaveAttribute("data-can-mutate", "true");
  });
});
