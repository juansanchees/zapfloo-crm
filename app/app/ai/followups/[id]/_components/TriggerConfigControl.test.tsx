import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type * as XYFlowModule from "@xyflow/react";

import { TriggerConfigControl } from "./TriggerConfigControl";
import { FlowCanvas } from "./FlowCanvas";
import type { FollowupFlowDetailRow } from "@/hooks/followup/useFollowupFlow";

const state = vi.hoisted(() => ({
  mutate: vi.fn(),
  flow: null as FollowupFlowDetailRow | null,
}));
vi.mock("@/hooks/followup/useFollowupFlow", () => ({
  useFollowupFlow: () => ({ data: state.flow }),
  useUpdateTriggerConfig: () => ({ mutate: state.mutate, isPending: false }),
  useDisableFollowupFlow: () => ({ isPending: false }),
  usePublishFollowupFlow: () => ({ isPending: false }),
  useRollbackFollowupFlow: () => ({ isPending: false }),
  useSaveFollowupFlowDraft: () => ({ isPending: false }),
  useUpdateHandoffPolicy: () => ({ isPending: false }),
  useDeleteFollowupFlow: () => ({ isPending: false }),
}));
vi.mock("@/hooks/followup/useEtapasDeGatilho", () => ({
  useEtapasDeGatilho: () => ({ etapas: [], carregando: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// jsdom não calcula o canvas. Só a superfície gráfica é substituída: seleção,
// montagem/desmontagem do painel e estado de formulário continuam reais.
vi.mock("@xyflow/react", async (original) => {
  const real = await original<typeof XYFlowModule>();
  return {
    ...real,
    ReactFlowProvider: ({ children }: { children: ReactNode }) => children,
    useReactFlow: () => ({ screenToFlowPosition: (p: unknown) => p }),
    Background: () => null,
    Controls: () => null,
    ReactFlow: ({ nodes, onNodeClick }: {
      nodes: Array<{ id: string }>;
      onNodeClick: (event: unknown, node: unknown) => void;
    }) => <div>{nodes.map((node) => <button key={node.id} onClick={(e) => onNodeClick(e, node)}>{`Selecionar ${node.id}`}</button>)}</div>,
  };
});

const config = () => ({ kind: "silence", params: { threshold_minutes: 60 } });
beforeEach(() => {
  state.mutate.mockReset();
  state.flow = {
    id: "flow", name: "Fluxo", status: "draft", active_version_id: null,
    handoff_policy: "pause", trigger_config: config(), created_at: "", updated_at: "",
    versions_count: 0, previous_version_id: null,
    draft_graph: { nodes: [
      { id: "inicio", type: "trigger", label: "Início", config: {}, position: { x: 0, y: 0 } },
      { id: "espera", type: "wait", label: "Espera", config: { mode: "fixed", duration_ms: 300_000 }, position: { x: 0, y: 100 } },
    ], edges: [] },
  } as FollowupFlowDetailRow;
});

describe("rascunho do gatilho", () => {
  it("toolbar e painel do nó editam o mesmo rascunho, nos dois sentidos", () => {
    render(<FlowCanvas flowId="flow" initialData={state.flow!} />);
    fireEvent.click(screen.getByRole("button", { name: "Selecionar inicio" }));
    const inline = within(screen.getByTestId("node-config-panel"));
    fireEvent.change(inline.getByLabelText("Minutos de silêncio"), { target: { value: "15" } });
    fireEvent.click(screen.getByTestId("trigger-config-button"));
    const toolbar = within(screen.getByTestId("trigger-config-panel"));
    expect(toolbar.getByLabelText("Minutos de silêncio")).toHaveValue(15);
    fireEvent.change(toolbar.getByLabelText("Minutos de silêncio"), { target: { value: "25" } });
    expect(inline.getByLabelText("Minutos de silêncio")).toHaveValue(25);
  });

  it("sem edição local acompanha configuração persistida nova", () => {
    const view = render(<TriggerConfigControl flowId="flow" triggerConfig={config()} variant="inline" />);
    view.rerender(<TriggerConfigControl flowId="flow" triggerConfig={{ kind: "silence", params: { threshold_minutes: 90 } }} variant="inline" />);
    expect(screen.getByLabelText("Minutos de silêncio")).toHaveValue(90);
    expect(screen.getByRole("button", { name: "Salvar gatilho" })).toBeDisabled();
  });

  it("refetch não sobrescreve edição inline não salva", () => {
    const view = render(<TriggerConfigControl flowId="flow" triggerConfig={config()} variant="inline" />);
    fireEvent.change(screen.getByLabelText("Minutos de silêncio"), { target: { value: "15" } });
    view.rerender(<TriggerConfigControl flowId="flow" triggerConfig={{ kind: "silence", params: { threshold_minutes: 90 } }} variant="inline" />);
    expect(screen.getByLabelText("Minutos de silêncio")).toHaveValue(15);
    expect(screen.getByRole("button", { name: "Salvar gatilho" })).toBeEnabled();
  });

  it("trocar de nó e fechar painel não descartam o gatilho ainda não salvo", () => {
    render(<FlowCanvas flowId="flow" initialData={state.flow!} />);
    fireEvent.click(screen.getByRole("button", { name: "Selecionar inicio" }));
    fireEvent.change(screen.getByLabelText("Minutos de silêncio"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "Selecionar espera" }));
    fireEvent.click(screen.getByRole("button", { name: "Selecionar inicio" }));
    expect(screen.getByLabelText("Minutos de silêncio")).toHaveValue(15);
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    fireEvent.click(screen.getByRole("button", { name: "Selecionar inicio" }));
    expect(screen.getByLabelText("Minutos de silêncio")).toHaveValue(15);
  });

  it("sucesso de uma gravação não apaga edição feita enquanto a requisição estava em voo", () => {
    const view = render(<TriggerConfigControl flowId="flow" triggerConfig={config()} variant="inline" />);
    fireEvent.change(screen.getByLabelText("Minutos de silêncio"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar gatilho" }));
    fireEvent.change(screen.getByLabelText("Minutos de silêncio"), { target: { value: "25" } });
    view.rerender(<TriggerConfigControl flowId="flow" triggerConfig={{ kind: "silence", params: { threshold_minutes: 15 } }} variant="inline" />);
    act(() => state.mutate.mock.calls[0]![1].onSuccess());
    expect(screen.getByLabelText("Minutos de silêncio")).toHaveValue(25);
    expect(screen.getByRole("button", { name: "Salvar gatilho" })).toBeEnabled();
  });
});
