import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
const draftMutate = vi.fn();
let suggestions: string[] = [];

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
      options.onSuccess({ data: { suggestions } });
    },
    isPending: false,
  }),
}));

import { Composer } from "@/components/inbox/Composer";

function renderComposer() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Composer conversationId="conv-1" />
    </QueryClientProvider>,
  );
}

describe("Composer — sugestões de IA", () => {
  beforeEach(() => {
    sendMock.mockClear();
    draftMutate.mockClear();
    suggestions = [];
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
});
