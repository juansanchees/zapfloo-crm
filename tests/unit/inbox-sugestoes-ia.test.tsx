import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
const draftMutate = vi.fn();
let suggestions: string[] = [];
let draftPending = false;
let resolveDraft: (() => void) | null = null;

vi.mock("@/hooks/inbox/useSendMessage", () => ({
  useSendMessage: () => ({ mutate: sendMock, isPending: false }),
}));
vi.mock("@/hooks/inbox/useCreateNote", () => ({
  useCreateNote: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useUploadMedia", () => ({
  useUploadMedia: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useMessageTemplates", () => ({
  useMessageTemplates: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/inbox/useDraftReply", () => ({
  useDraftReply: () => ({
    mutate: (conversationId: string, options: { onSuccess: (data: { data: { suggestions: string[] } }) => void }) => {
      draftMutate(conversationId);
      const deliver = () => options.onSuccess({ data: { suggestions } });
      if (draftPending) {
        resolveDraft = deliver;
        return;
      }
      deliver();
    },
    isPending: false,
  }),
}));

import { Composer } from "@/components/inbox/Composer";

function composer(conversationId: string) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <Composer conversationId={conversationId} />
    </QueryClientProvider>
  );
}

function renderComposer(conversationId = "conv-1") {
  return render(
    composer(conversationId),
  );
}

describe("Composer — sugestões de IA", () => {
  beforeEach(() => {
    sendMock.mockClear();
    draftMutate.mockClear();
    suggestions = [];
    draftPending = false;
    resolveDraft = null;
  });

  it("selecionar uma sugestão preenche e permite editar, mas só envia no gesto explícito", () => {
    suggestions = ["Resposta A", "Resposta B", "Resposta C"];
    renderComposer();

    fireEvent.click(screen.getByRole("button", { name: /sugerir resposta/i }));
    fireEvent.click(screen.getByRole("button", { name: "Resposta B" }));

    const textarea = screen.getByLabelText("Mensagem");
    expect(textarea).toHaveValue("Resposta B");
    fireEvent.change(textarea, { target: { value: "Resposta B revisada" } });
    expect(sendMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^enviar$/i }));
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ conversation_id: "conv-1", body: "Resposta B revisada", type: "text" }),
      expect.anything(),
    );
  });

  it("lista vazia não renderiza faixa nem toast", () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: /sugerir resposta/i }));

    expect(screen.queryByText("Resposta A")).not.toBeInTheDocument();
    expect(screen.queryByText("Resposta B")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("trocar da conversa A para B remove sugestões já recebidas de A", () => {
    suggestions = ["Resposta exclusiva da conversa A"];
    const view = renderComposer("conv-A");
    fireEvent.click(screen.getByRole("button", { name: /sugerir resposta/i }));
    expect(screen.getByRole("button", { name: "Resposta exclusiva da conversa A" })).toBeInTheDocument();

    view.rerender(composer("conv-B"));

    expect(screen.queryByRole("button", { name: "Resposta exclusiva da conversa A" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Mensagem")).toHaveValue("");
  });

  it("resposta tardia de A é descartada após trocar para B", () => {
    suggestions = ["Resposta tardia da conversa A"];
    draftPending = true;
    const view = renderComposer("conv-A");
    fireEvent.click(screen.getByRole("button", { name: /sugerir resposta/i }));
    expect(resolveDraft).not.toBeNull();

    view.rerender(composer("conv-B"));
    resolveDraft?.();

    expect(screen.queryByRole("button", { name: "Resposta tardia da conversa A" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Mensagem")).toHaveValue("");
    expect(sendMock).not.toHaveBeenCalled();
  });
});
