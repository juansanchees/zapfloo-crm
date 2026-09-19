import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (text: string) => text }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useUser: () => ({ id: "platform-1", is_platform_admin: true }),
  useActiveOrg: () => ({ orgId: "org-1", role: "agent" }),
}));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({
  useAssignableMembers: () => ({ data: [] }),
}));
vi.mock("@/hooks/kanban/useBulkAction", () => ({
  useBulkAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { BulkActionBar } from "@/components/kanban/BulkActionBar";

const common = {
  selectedIds: ["lead-1"],
  stages: [{ id: "stage-1", name: "Entrada" }] as never,
  pipelineId: "pipeline-1",
  onClear: vi.fn(),
};

describe("atribuição em lote segue o papel tenant", () => {
  it("admin de plataforma com membership agent não vê Responsável", () => {
    render(<BulkActionBar {...common} canAssign={false} />);
    expect(screen.getByRole("button", { name: "Mover para…" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Responsável…" })).not.toBeInTheDocument();
  });

  it("manager tenant vê Responsável", () => {
    render(<BulkActionBar {...common} canAssign />);
    expect(screen.getByRole("button", { name: "Responsável…" })).toBeVisible();
  });
});
