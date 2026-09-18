import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ replace: vi.fn(), search: "pipeline=p2&lead=l2", boardIds: [] as Array<string | null>, canMutate: true }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: state.replace }), usePathname: () => "/app/kanban", useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (text: string) => text }));
vi.mock("@/hooks/auth/AuthProvider", () => ({ usePermission: () => state.canMutate }));
vi.mock("@/hooks/kanban/useBoard", () => ({ useBoard: (id: string | null) => {
  state.boardIds.push(id);
  return { data: { pipeline: { id: id ?? "p2", name: "Secundário", vocabulary: {} }, stages: [], leads: [], summary: { open_by_currency: {}, won_month_by_currency: {} } }, isLoading: false, error: null, pulses: new Map(), realtimeStatus: "subscribed", seguranca: { divergencias: 0, ultimaVerificacao: null } };
} }));
vi.mock("@/components/kanban/FilterBar", () => ({ FilterBar: ({ onChange }: { onChange: (next: { status: "won" }) => void }) => <button onClick={() => onChange({ status: "won" })}>Filtrar ganhos</button> }));
vi.mock("@/components/kanban/KanbanBoard", () => ({ KanbanBoard: () => null }));
vi.mock("@/components/kanban/BulkActionBar", () => ({ BulkActionBar: () => null }));
vi.mock("@/components/kanban/NewLeadDialog", () => ({ NewLeadDialog: ({ open }: { open: boolean }) => open ? <div role="dialog">Novo negócio aberto</div> : null }));
vi.mock("@/app/app/kanban/_client", () => ({ FunisClient: ({ onFunisChange }: { onFunisChange?: (rows: Array<{ id: string; name: string; slug: string; description: null; position: number; is_default: boolean }>) => void }) => <button onClick={() => onFunisChange?.([{ id: "p2", name: "Renomeado", slug: "p2", description: null, position: 1, is_default: true }])}>Arquivar/renomear</button> }));
vi.mock("@hello-pangea/dnd", () => ({ Draggable: ({ children }: { children: (provided: { innerRef: ReturnType<typeof vi.fn>; draggableProps: Record<string, never>; dragHandleProps: Record<string, never> }, snapshot: { isDragging: boolean }) => ReactNode }) => children({ innerRef: vi.fn(), draggableProps: {}, dragHandleProps: {} }, { isDragging: false }) }));
vi.mock("@/components/kanban/KanbanCardActions", () => ({ KanbanCardActions: () => null }));
vi.mock("@/components/kanban/NextActionSlot", () => ({ NextActionSlot: () => null }));
vi.mock("@/components/kanban/ReactivationSlot", () => ({ ReactivationSlot: () => null }));
vi.mock("@/components/kanban/ConversaSlot", () => ({ ConversaSlot: () => null }));
vi.mock("@/components/kanban/ScoreSlot", () => ({ ScoreSlot: () => null }));
vi.mock("@/components/kanban/OwnerBadge", () => ({ OwnerBadge: () => null }));

import { PipelinePageClient } from "@/app/app/pipelines/[id]/_client";
import { KanbanWorkspace } from "@/app/app/kanban/_components/KanbanWorkspace";
import { KanbanCard } from "@/components/kanban/KanbanCard";

const funis = [
  { id: "p1", name: "Padrão", slug: "p1", description: null, position: 1, is_default: true },
  { id: "p2", name: "Secundário", slug: "p2", description: null, position: 2, is_default: false },
];

beforeEach(() => { state.replace.mockClear(); state.boardIds = []; state.search = "pipeline=p2&lead=l2"; state.canMutate = true; });

describe("quadro Nocturne", () => {
  it("preserva pipeline e lead ao usar o controle real de filtro", () => {
    render(<PipelinePageClient pipelineId="p2" initialName="Secundário" />);
    fireEvent.click(screen.getByRole("button", { name: "Filtrar ganhos" }));
    expect(state.replace).toHaveBeenCalledWith("/app/kanban?pipeline=p2&lead=l2&status=won", { scroll: false });
    expect(state.boardIds).toContain("p2");
  });

  it("só agent+ recebe e abre Novo negócio", () => {
    state.canMutate = false;
    const { rerender } = render(<PipelinePageClient pipelineId="p2" initialName="Secundário" />);
    expect(screen.queryByRole("button", { name: "Novo negócio" })).not.toBeInTheDocument();
    state.canMutate = true;
    rerender(<PipelinePageClient pipelineId="p2" initialName="Secundário" />);
    fireEvent.click(screen.getByRole("button", { name: "Novo negócio" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Novo negócio aberto");
  });

  it("mantém abas e gestão na mesma lista reativa", () => {
    render(<KanbanWorkspace funis={funis} pipelineInicial="p2" podeGerenciar podeImportar />);
    expect(screen.getByRole("tab", { name: "Secundário" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("button", { name: "Arquivar/renomear" }));
    expect(screen.getByRole("tab", { name: "Renomeado" })).toHaveAttribute("aria-selected", "true");
  });

  it("mostra contato ausente e origem independentemente", () => {
    render(<KanbanCard card={{ id: "l1", title: "Negócio", valueCents: null, currency: null, owner: { kind: null, name: null, agentVersion: null }, stageName: "Entrada", hoursInStage: 1, isCooling: false, tags: [] }} lead={{ id: "l1", title: "Negócio", source: "manual", contact: undefined, tags: [], value_cents: null, currency: null } as never} index={0} pipelineId="p2" />);
    expect(screen.getByText("Sem contato").parentElement).toHaveTextContent("Sem contato · manual");
  });
});
