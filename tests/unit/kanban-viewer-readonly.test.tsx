import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { CardInput } from "@/lib/kanban/card-state";
import type { Lead } from "@/lib/types/leads";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (text: string) => text }));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useTagDeIdioma: () => "pt-BR" }));
vi.mock("@/hooks/leads/useLeadTimeline", () => ({
  useLeadTimeline: () => ({
    itens: [],
    chegouAoVivo: new Set(),
    isLoading: false,
    isError: false,
    realtimeStatus: "subscribed",
    seguranca: { divergencias: 0 },
  }),
}));
vi.mock("@/hooks/kanban/useNextAction", () => ({
  useDecidirProximaAcao: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/kanban/useReativacao", () => ({
  useDecidirReativacao: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/kanban/useUpdateLead", () => ({
  useWinLead: () => ({ mutate: vi.fn(), isPending: false }),
  useEditLead: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useLoseLead: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({
  useAssignableMembers: () => ({ data: [] }),
}));
vi.mock("@/hooks/kanban/useAssignableAgents", () => ({
  useAssignableAgents: () => ({ data: [] }),
}));
vi.mock("@hello-pangea/dnd", () => ({
  Draggable: ({ children }: { children: (provided: { innerRef: ReturnType<typeof vi.fn>; draggableProps: Record<string, never>; dragHandleProps: Record<string, never> }, snapshot: { isDragging: boolean }) => ReactNode }) => children({ innerRef: vi.fn(), draggableProps: {}, dragHandleProps: {} }, { isDragging: false }),
}));

import { KanbanCard } from "@/components/kanban/KanbanCard";
import { LeadDossier } from "@/components/kanban/LeadDossier";

const lead = {
  id: "lead-1",
  organization_id: "org-1",
  pipeline_id: "pipeline-1",
  stage_id: "stage-1",
  contact_id: null,
  title: "Consulta inicial",
  description: "Cliente pediu retorno amanhã",
  status: "open",
  lost_reason: null,
  position_in_stage: 1,
  value_cents: 12000,
  currency: "BRL",
  owner_user_id: null,
  owner_kind: null,
  owner_agent_id: null,
  assigned_at: null,
  last_activity_at: null,
  expected_close_date: "2026-09-30",
  closed_at: null,
  stage_changed_at: "2026-09-18T10:00:00Z",
  source: "manual",
  source_metadata: {},
  external_id: null,
  custom_fields: { unidade: "Centro" },
  tags: ["retorno"],
  created_at: "2026-09-18T10:00:00Z",
  updated_at: "2026-09-18T10:00:00Z",
  created_by_user_id: null,
} satisfies Lead;

function card(overrides: Partial<CardInput>): CardInput {
  return {
    id: lead.id,
    title: lead.title,
    valueCents: lead.value_cents,
    currency: lead.currency,
    owner: { kind: null, name: null, agentVersion: null },
    stageName: "Entrada",
    hoursInStage: 2,
    isCooling: false,
    tags: [],
    ...overrides,
  };
}

function renderCard(cardInput: CardInput, canMutate: boolean) {
  return render(
    <KanbanCard
      card={cardInput}
      lead={lead}
      index={0}
      pipelineId="pipeline-1"
      canMutate={canMutate}
    />,
  );
}

describe("Kanban somente leitura para viewer", () => {
  it("viewer abre o dossiê mesmo com Ctrl/Cmd/Shift e nunca entra em seleção", () => {
    const onOpen = vi.fn();
    const onSelect = vi.fn();
    render(
      <KanbanCard
        card={card({})}
        lead={lead}
        index={0}
        pipelineId="pipeline-1"
        canMutate={false}
        onOpen={onOpen}
        onSelect={onSelect}
      />,
    );

    const title = screen.getByRole("button", { name: "Consulta inicial" });
    fireEvent.click(title, { ctrlKey: true });
    fireEvent.click(title, { metaKey: true });
    fireEvent.click(title, { shiftKey: true });

    expect(onSelect).not.toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalledTimes(3);
    expect(onOpen).toHaveBeenCalledWith("lead-1");
  });

  it("mostra a próxima ação sem Aprovar/Ignorar para viewer", () => {
    renderCard(card({ nextAction: { label: "Ligar amanhã" } }), false);
    expect(screen.getByText(/Ligar amanhã/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Aprovar:/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ignorar:/ })).not.toBeInTheDocument();
  });

  it("preserva os controles da próxima ação para agent+", () => {
    renderCard(card({ nextAction: { label: "Ligar amanhã" } }), true);
    expect(screen.getByRole("button", { name: "Aprovar: Ligar amanhã" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Ignorar: Ligar amanhã" })).toBeVisible();
  });

  it("mostra a proposta de retomada sem Retomar/Encerrar para viewer", () => {
    renderCard(card({ reactivation: { proposalId: "proposal-1", expiresAt: "2099-01-01T00:00:00Z" } }), false);
    expect(screen.getByText(/Retomar contato\?/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Retomar contato com este negócio" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Encerrar: não retomar este negócio" })).not.toBeInTheDocument();
  });

  it("preserva os controles de retomada para agent+", () => {
    renderCard(card({ reactivation: { proposalId: "proposal-1", expiresAt: "2099-01-01T00:00:00Z" } }), true);
    expect(screen.getByRole("button", { name: "Retomar contato com este negócio" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Encerrar: não retomar este negócio" })).toBeVisible();
  });

  it("mantém o dossiê legível, sem formulário nem Salvar, para viewer", () => {
    render(
      <LeadDossier
        open
        onOpenChange={vi.fn()}
        lead={lead}
        pipelineId="pipeline-1"
        stageName="Entrada"
        fieldDefs={[{ key: "unidade", label: "Unidade", type: "text" }]}
        canMutate={false}
      />,
    );
    expect(screen.getByText("Cliente pediu retorno amanhã")).toBeVisible();
    expect(screen.getByText("Centro")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Editar campos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Descrição")).not.toBeInTheDocument();
  });

  it("preserva formulário e Salvar para agent+", () => {
    render(
      <LeadDossier
        open
        onOpenChange={vi.fn()}
        lead={lead}
        pipelineId="pipeline-1"
        stageName="Entrada"
        canMutate
      />,
    );
    expect(screen.getByRole("button", { name: "Editar campos" })).toBeVisible();
    expect(screen.getByLabelText("Descrição")).toHaveValue("Cliente pediu retorno amanhã");
    expect(screen.getByRole("button", { name: "Salvar" })).toBeVisible();
  });
});
