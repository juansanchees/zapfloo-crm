import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const p1 = { id: "p1", name: "Padrão", slug: "p1", description: null, position: 1, is_default: true };
const p2 = { id: "p2", name: "Secundário", slug: "p2", description: null, position: 2, is_default: false };
const p3 = { id: "p3", name: "Novo", slug: "p3", description: null, position: 3, is_default: false };

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (text: string) => text }));
vi.mock("@/components/billing/PlanoProvider", () => ({ usePlano: () => ({ permiteQuantidade: () => true }) }));
vi.mock("@/components/empty", () => ({ EmptyPipeline: () => null }));
vi.mock("@/app/app/kanban/_components/ImportarLeads", () => ({ ImportarLeads: () => null }));
vi.mock("@/app/app/pipelines/[id]/_client", () => ({ PipelinePageClient: ({ pipelineId, canMutate, canAssign }: { pipelineId: string; canMutate: boolean; canAssign: boolean }) => <output data-testid="board" data-can-mutate={String(canMutate)} data-can-assign={String(canAssign)}>{pipelineId}</output> }));
vi.mock("@/hooks/pipelines/usePipelines", () => ({
  useCriarFunil: () => ({ isPending: false, mutate: (_input: unknown, opts: { onSuccess: (r: unknown) => void }) => opts.onSuccess({ data: { pipelines: [p1, p2, p3] } }) }),
  useEditarFunil: () => ({ isPending: false, mutate: ({ patch }: { patch: { name?: string; depois_de?: string | null } }, opts: { onSuccess: (r: unknown) => void }) => opts.onSuccess({ data: { pipelines: patch.name ? [p1, { ...p2, name: patch.name }, p3] : [p2, p1, p3] } }) }),
  useArquivarFunil: () => ({ isPending: false, mutate: (_input: unknown, opts: { onSuccess: (r: unknown) => void }) => opts.onSuccess({ data: { pipelines: [p1, p3] } }) }),
}));

import { KanbanWorkspace } from "@/app/app/kanban/_components/KanbanWorkspace";

describe("gestão de funis atualiza as abas pela resposta real da mutação", () => {
  it("cria, reordena, renomeia e arquiva sincronizando tabs e seleção", () => {
    render(<KanbanWorkspace funis={[p1, p2]} pipelineInicial="p2" podeGerenciar podeImportar podeMover podeAtribuir />);
    expect(screen.getByRole("tab", { name: "Secundário" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("board")).toHaveAttribute("data-can-mutate", "true");
    expect(screen.getByTestId("board")).toHaveAttribute("data-can-assign", "true");

    fireEvent.click(screen.getByTestId("novo-funil"));
    fireEvent.change(screen.getByTestId("nome-do-novo-funil"), { target: { value: "Novo" } });
    fireEvent.click(screen.getByTestId("confirmar-novo-funil"));
    expect(screen.getByRole("tab", { name: "Novo" })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("subir-p2"));
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Secundário", "Padrão", "Novo"]);

    fireEvent.click(screen.getByTestId("renomear-p2"));
    fireEvent.change(screen.getByTestId("nome-p2"), { target: { value: "Renomeado" } });
    fireEvent.click(screen.getByTestId("salvar-nome-p2"));
    expect(screen.getByRole("tab", { name: "Renomeado" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByTestId("arquivar-p2"));
    fireEvent.click(screen.getByTestId("arquivar-confirmar-p2"));
    expect(screen.queryByRole("tab", { name: "Renomeado" })).not.toBeInTheDocument();
    expect(screen.getByTestId("board")).toHaveTextContent("p1");
  });

  it("propaga o papel tenant viewer como quadro somente leitura", () => {
    render(<KanbanWorkspace funis={[p1]} pipelineInicial="p1" podeGerenciar={false} podeImportar={false} podeMover={false} podeAtribuir={false} />);
    expect(screen.getByTestId("board")).toHaveAttribute("data-can-mutate", "false");
  });

  it("não usa a permissão de importação como proxy das ações do quadro", () => {
    render(<KanbanWorkspace funis={[p1]} pipelineInicial="p1" podeGerenciar={false} podeImportar={false} podeMover podeAtribuir={false} />);
    expect(screen.getByTestId("board")).toHaveAttribute("data-can-mutate", "true");
    expect(screen.getByTestId("board")).toHaveAttribute("data-can-assign", "false");
  });
});
