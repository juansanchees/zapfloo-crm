import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ canMutate: false, win: vi.fn() }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (text: string) => text }));
vi.mock("@/hooks/auth/AuthProvider", () => ({ usePermission: () => state.canMutate }));
vi.mock("@/hooks/kanban/useUpdateLead", () => ({ useWinLead: () => ({ mutate: state.win, isPending: false }), useEditLead: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({ useAssignableMembers: () => ({ data: [] }) }));
vi.mock("@/hooks/kanban/useAssignableAgents", () => ({ useAssignableAgents: () => ({ data: [] }) }));
vi.mock("@/components/kanban/LoseLeadDialog", () => ({ LoseLeadDialog: () => null }));
vi.mock("@/components/kanban/EditLeadDialog", () => ({ EditLeadDialog: () => null }));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => <button onClick={onSelect}>{children}</button>,
  DropdownMenuSeparator: () => null, DropdownMenuSub: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, DropdownMenuSubTrigger: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

import { KanbanCardActions } from "@/components/kanban/KanbanCardActions";

const lead = { id: "l1", owner_user_id: null, owner_agent_id: null } as never;
beforeEach(() => { state.canMutate = false; state.win.mockClear(); });

describe("ações do card respeitam papel", () => {
  it("viewer não recebe menu mutante", () => {
    render(<KanbanCardActions lead={lead} pipelineId="p1" onAdvance={vi.fn()} />);
    expect(screen.queryByLabelText("Ações do lead")).not.toBeInTheDocument();
    expect(screen.queryByText("Avançar")).not.toBeInTheDocument();
    expect(screen.queryByText("Ganhar")).not.toBeInTheDocument();
  });

  it("agent recebe avanço e ganhar chama a mutation canônica", () => {
    state.canMutate = true;
    const advance = vi.fn();
    render(<KanbanCardActions lead={lead} pipelineId="p1" onAdvance={advance} />);
    fireEvent.click(screen.getByRole("button", { name: "Avançar" }));
    fireEvent.click(screen.getByRole("button", { name: "Ganhar" }));
    expect(advance).toHaveBeenCalledOnce();
    expect(state.win).toHaveBeenCalledWith({ leadId: "l1" });
  });
});
