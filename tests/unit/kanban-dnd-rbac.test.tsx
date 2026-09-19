import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ onDragEnd: undefined as undefined | ((result: unknown) => void), move: vi.fn(), columnProps: [] as Array<{ canMutate?: boolean }>, dragDisabled: undefined as boolean | undefined }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (text: string) => text }));
// Simula admin de plataforma: o gate global permitiria, mas viewer tenant não
// pode arrastar porque a rota de movimento exige agent+ na organização.
vi.mock("@/hooks/auth/AuthProvider", () => ({ usePermission: () => true }));
vi.mock("@/hooks/kanban/useBoard", () => ({ useBoard: () => ({ data: undefined, isLoading: false, isError: false, error: null, pulses: new Map() }) }));
vi.mock("@/hooks/kanban/useMoveCard", () => ({ useMoveCard: () => ({ mutate: state.move }) }));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({ useAssignableMembers: () => ({ data: [] }) }));
vi.mock("@/hooks/leads/useAtRiskLeads", () => ({ useAtRiskLeads: () => ({ data: { items: [] } }) }));
vi.mock("@/hooks/leads/useReactivations", () => ({ useReactivations: () => ({ data: [] }) }));
vi.mock("@hello-pangea/dnd", () => ({ DragDropContext: ({ onDragEnd, children }: { onDragEnd: (r: unknown) => void; children: React.ReactNode }) => { state.onDragEnd = onDragEnd; return <div>{children}</div>; }, Draggable: ({ isDragDisabled, children }: { isDragDisabled: boolean; children: (p: { innerRef: () => void; draggableProps: Record<string, never>; dragHandleProps: Record<string, never> }, s: { isDragging: boolean }) => React.ReactNode }) => { state.dragDisabled = isDragDisabled; return children({ innerRef: () => undefined, draggableProps: {}, dragHandleProps: {} }, { isDragging: false }); } }));
vi.mock("@/components/kanban/StageColumn", () => ({ StageColumn: (props: { canMutate?: boolean }) => { state.columnProps.push(props); return null; } }));
vi.mock("@/components/kanban/LeadDossier", () => ({ LeadDossier: () => null }));
vi.mock("@/components/kanban/KanbanCardActions", () => ({ KanbanCardActions: () => null }));
vi.mock("@/components/kanban/NextActionSlot", () => ({ NextActionSlot: () => null }));
vi.mock("@/components/kanban/ReactivationSlot", () => ({ ReactivationSlot: () => null }));
vi.mock("@/components/kanban/ConversaSlot", () => ({ ConversaSlot: () => null }));
vi.mock("@/components/kanban/ScoreSlot", () => ({ ScoreSlot: () => null }));
vi.mock("@/components/kanban/OwnerBadge", () => ({ OwnerBadge: () => null }));

import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { KanbanCard } from "@/components/kanban/KanbanCard";

const stages = [
  { id: "s1", name: "Entrada", position: 1, is_won: false, is_lost: false, is_archived: false },
  { id: "s2", name: "Proposta", position: 2, is_won: false, is_lost: false, is_archived: false },
] as never;
const leads = [{ id: "l1", stage_id: "s1", position_in_stage: 1, updated_at: "2026-09-01T00:00:00Z" }] as never;
const pipeline = { settings: {} } as never;
const drop = { draggableId: "l1", source: { droppableId: "s1", index: 0 }, destination: { droppableId: "s2", index: 0 } };

beforeEach(() => { state.onDragEnd = undefined; state.move.mockClear(); state.columnProps = []; state.dragDisabled = undefined; });

describe("drag do kanban respeita RBAC", () => {
  it("admin de plataforma com membership viewer recebe coluna sem drag e o drop não muta", () => {
    render(<KanbanBoard pipelineId="p1" stages={stages} leads={leads} pipeline={pipeline} canMutate={false} />);
    expect(state.columnProps.every((props) => props.canMutate === false)).toBe(true);
    state.onDragEnd?.(drop);
    expect(state.move).not.toHaveBeenCalled();
    render(<KanbanCard card={{ id: "l1", title: "L", valueCents: null, currency: null, owner: { kind: null, name: null, agentVersion: null }, stageName: "Entrada", hoursInStage: 0, isCooling: false, tags: [] }} lead={{ id: "l1", source: "manual", tags: [] } as never} index={0} pipelineId="p1" canMutate={false} />);
    expect(state.dragDisabled).toBe(true);
  });

  it("agent recebe drag e o drop chama a mutation de move", () => {
    render(<KanbanBoard pipelineId="p1" stages={stages} leads={leads} pipeline={pipeline} canMutate />);
    expect(state.columnProps.every((props) => props.canMutate === true)).toBe(true);
    state.onDragEnd?.(drop);
    expect(state.move).toHaveBeenCalledWith(expect.objectContaining({ leadId: "l1", stageId: "s2", expectedUpdatedAt: "2026-09-01T00:00:00Z" }));
    render(<KanbanCard card={{ id: "l1", title: "L", valueCents: null, currency: null, owner: { kind: null, name: null, agentVersion: null }, stageName: "Entrada", hoursInStage: 0, isCooling: false, tags: [] }} lead={{ id: "l1", source: "manual", tags: [] } as never} index={0} pipelineId="p1" canMutate />);
    expect(state.dragDisabled).toBe(false);
  });
});
