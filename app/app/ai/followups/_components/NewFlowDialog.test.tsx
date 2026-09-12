/**
 * O diálogo chamava `create.mutate` só com `onSuccess`. Quando o POST falhava,
 * a tela não dizia nada: o botão voltava do "Criando…", o diálogo continuava
 * aberto e o usuário clicava de novo achando que o clique não pegou.
 *
 * O teste guarda o COMPORTAMENTO — o erro aparece e o que foi digitado
 * sobrevive —, não a existência de um `onError`.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NewFlowDialog } from "./NewFlowDialog";
import { ApiError } from "@/lib/api/types";

const criar = vi.fn();
const gerar = vi.fn();
vi.mock("@/hooks/followup/useFollowupFlows", () => ({
  useCreateFollowupFlow: () => ({ mutate: criar, isPending: false }),
  useGenerateFollowupFlow: () => ({ mutate: gerar, isPending: false }),
}));

interface OpcoesDeMutacao {
  onSuccess?: () => void;
  onError?: (erro: unknown) => void;
}

/**
 * Lê o 2º argumento sem destruturar. Destruturando, uma chamada sem opções
 * derruba o teste com `Cannot read properties of undefined` — um TypeError que
 * se parece com defeito do componente e não é.
 */
function respondeCom(resposta: (opts: OpcoesDeMutacao) => void): void {
  criar.mockImplementation((...args: unknown[]) => {
    const opts = args[1] as OpcoesDeMutacao | undefined;
    if (opts) resposta(opts);
  });
}

function montar(canManageCredentials = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NewFlowDialog open onOpenChange={() => {}} canManageCredentials={canManageCredentials} />
    </QueryClientProvider>,
  );
}

describe("NewFlowDialog — o POST que falha não pode sumir", () => {
  beforeEach(() => {
    criar.mockReset();
    gerar.mockReset();
  });

  it("credencial recusada oferece revisão em outra aba sem perder a descrição", async () => {
    gerar.mockImplementation((_input: unknown, opts: OpcoesDeMutacao) => {
      opts.onError?.(new ApiError(503, "ai_credential_error", undefined, "fixture", "Revise a credencial do provedor de IA."));
    });
    const user = userEvent.setup({ delay: null });
    montar(true);
    await user.type(screen.getByLabelText("Nome"), "Boas-vindas");
    const description = "Envie uma mensagem após trinta minutos e encerre.";
    await user.type(screen.getByLabelText("Descreva o fluxo"), description);
    await user.click(screen.getByRole("button", { name: "Gerar rascunho" }));
    const link = screen.getByRole("link", { name: "Revisar chaves de IA" });
    expect(link).toHaveAttribute("href", "/app/ai/credentials");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByLabelText("Descreva o fluxo")).toHaveValue(description);
  });

  it("não oferece a tela técnica de credenciais para quem administra só o tenant", async () => {
    gerar.mockImplementation((_input: unknown, opts: OpcoesDeMutacao) => {
      opts.onError?.(new ApiError(503, "ai_credential_error", undefined, "fixture", "Revise a configuração de IA."));
    });
    const user = userEvent.setup({ delay: null });
    montar();
    await user.type(screen.getByLabelText("Nome"), "Boas-vindas");
    await user.type(screen.getByLabelText("Descreva o fluxo"), "Envie uma mensagem após trinta minutos e encerre.");
    await user.click(screen.getByRole("button", { name: "Gerar rascunho" }));

    expect(screen.queryByRole("link", { name: "Revisar chaves de IA" })).toBeNull();
    expect(screen.getByRole("link", { name: "Revisar modelo de IA" })).toHaveAttribute("href", "/app/ai/providers");
  });

  it("mostra a mensagem do servidor e mantém o nome digitado", async () => {
    gerar.mockImplementation((...args: unknown[]) => {
      const opts = args[1] as OpcoesDeMutacao;
      opts.onError?.(new Error("Já existe um fluxo com esse nome."));
    });
    const user = userEvent.setup({ delay: null });
    montar();
    await user.type(screen.getByLabelText("Nome"), "Recuperação de carrinho");
    await user.type(screen.getByLabelText("Descreva o fluxo"), "Envie uma mensagem após trinta minutos e encerre.");
    await user.click(screen.getByRole("button", { name: "Gerar rascunho" }));

    const campo = screen.getByLabelText("Nome");

    expect(await screen.findByRole("alert")).toHaveTextContent("Já existe um fluxo com esse nome.");
    // Fechar ou limpar aqui obrigaria a redigitar — o erro é do servidor, não do texto.
    expect(campo).toHaveValue("Recuperação de carrinho");
  });

  it("erro sem mensagem ainda vira frase de gente, nunca silêncio", async () => {
    const user = userEvent.setup({ delay: null });
    montar();
    await user.click(screen.getByRole("button", { name: "Criar manualmente" }));
    respondeCom((opts) => opts.onError?.(new Error("")));
    await user.type(screen.getByLabelText("Nome"), "Qualquer coisa");
    await user.click(screen.getByRole("button", { name: "Criar fluxo" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Não consegui criar o fluxo. Tente de novo.");
  });

  it("sucesso não deixa alerta na tela", async () => {
    const user = userEvent.setup({ delay: null });
    montar();
    await user.click(screen.getByRole("button", { name: "Criar manualmente" }));
    respondeCom((opts) => opts.onSuccess?.());
    await user.type(screen.getByLabelText("Nome"), "Fluxo bom");
    await user.click(screen.getByRole("button", { name: "Criar fluxo" }));

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("cria com IA somente depois de uma descrição suficiente e deixa claro que nasce em revisão", async () => {
    const user = userEvent.setup({ delay: null });
    montar();
    await user.type(screen.getByLabelText("Nome"), "Retomada comercial");
    expect(screen.getByRole("button", { name: "Gerar rascunho" })).toBeDisabled();
    await user.type(screen.getByLabelText("Descreva o fluxo"), "Espere uma hora, envie uma mensagem e encerre depois da resposta.");
    await user.click(screen.getByRole("button", { name: "Gerar rascunho" }));

    expect(gerar).toHaveBeenCalledWith(
      { name: "Retomada comercial", description: "Espere uma hora, envie uma mensagem e encerre depois da resposta." },
      expect.any(Object),
    );
    expect(screen.getByText(/Nada entra no ar sem sua revisão/)).toBeInTheDocument();
  });
});
