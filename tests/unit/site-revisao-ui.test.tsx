import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { KnowledgeSourceCard } from "@/components/ai/KnowledgeSourceCard";
import { NovoMaterialDialog } from "@/components/ai/NovoMaterialDialog";
import type { SourceRow } from "@/hooks/ai/useKnowledgeSources";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const ID = "33333333-3333-4333-8333-333333333333";
function material(over: Partial<SourceRow> = {}): SourceRow {
  return {
    id: ID,
    organization_id: "org",
    agent_id: null,
    source_type: "site",
    name: "Site do negócio",
    status: "ready",
    is_active: false,
    last_index_status: "success",
    last_index_error: null,
    last_indexed_at: null,
    chunks_count: 0,
    active_kb_version_id: null,
    source_metadata: {
      site: {
        url: "https://loja.example/",
        perguntas: 1,
        tentativas: 1,
        concluidaEm: "2026-09-12T10:00:00.000Z",
        recusas: [
          {
            url: "https://loja.example/produtos",
            linha: 7,
            item: "Consulta",
            motivo: "site_preco_ambiguo",
          },
        ],
      },
    },
    created_at: "",
    updated_at: "",
    ...over,
  };
}
function card(source = material(), onMudou = vi.fn()) {
  render(
    <KnowledgeSourceCard
      source={source}
      usadoPor={[]}
      onReindex={vi.fn()}
      onArquivar={vi.fn()}
      onMudou={onMudou}
    />,
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("revisão de site é uma ação visível, não publicação implícita", () => {
  it("não oferece site no cadastro manual e mostra rascunho com linha recusada", () => {
    render(<NovoMaterialDialog aberto onFechar={vi.fn()} onCriado={vi.fn()} podeIndexar />);
    expect(screen.queryByTestId("material-tipo-site")).not.toBeInTheDocument();
    cleanup();
    card();
    expect(screen.getByText("Aguardando sua conferência")).toBeInTheDocument();
    expect(screen.getByText(/O preço tem mais de uma interpretação/)).toHaveTextContent(
      "Linha 7: Consulta — O preço tem mais de uma interpretação. Não importei este produto.",
    );
    expect(screen.queryByTestId(`material-reindexar-${ID}`)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Conferir produtos" })).toHaveAttribute(
      "href",
      "/app/products",
    );
  });
  it("carrega pares reais, pede conferência e envia a aprovação só depois do clique", async () => {
    const fetch = vi.fn(
      async (_url: string, init?: RequestInit) =>
        new Response(
          JSON.stringify({
            data:
              init?.method === "PATCH"
                ? { id: ID }
                : {
                    items: [
                      { question: "Quando abre?", answer: "Às nove.", tags: [], locale: "pt-BR" },
                    ],
                  },
          }),
          { headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetch);
    card();
    fireEvent.click(screen.getByRole("button", { name: "Revisar perguntas" }));
    await waitFor(() =>
      expect(screen.getByTestId("faq-editar-texto")).toHaveValue(
        "## Pergunta: Quando abre?\n## Resposta: Às nove.",
      ),
    );
    const botao = screen.getByRole("button", { name: "Confirmar perguntas" });
    expect(botao).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Conferi as perguntas e respostas e autorizo o uso pelo agente.",
      }),
    );
    expect(botao).toBeEnabled();
    fireEvent.change(screen.getByTestId("faq-editar-texto"), {
      target: { value: "## Pergunta: Quando abre?\n## Resposta: Às dez." },
    });
    expect(botao).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(botao);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toMatchObject({
      confirmar_site: true,
      items: [{ question: "Quando abre?", answer: "Às dez." }],
    });
  });
  it("leitura ativa não oferece revisar; falha tem motivo e nova tentativa de leitura", async () => {
    card(material({ status: "building", last_index_status: "indexando" }));
    expect(screen.getByText("Lendo o seu site…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revisar perguntas" })).not.toBeInTheDocument();
    cleanup();
    const fetch = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ data: { queued: true } }), {
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const mudou = vi.fn();
    card(
      material({
        status: "failed",
        last_index_status: "failed",
        last_index_error: "site_tempo_limite",
      }),
      mudou,
    );
    expect(
      screen.getByText(
        "O site demorou para responder. Você pode continuar e tentar de novo depois.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar ler o site de novo" }));
    await waitFor(() => expect(mudou).toHaveBeenCalledTimes(1));
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/v1/onboarding/site/retry");
  });
  it("sem perguntas não abre editor vazio; JSON antigo ruim não quebra a biblioteca", () => {
    const source = material();
    (source.source_metadata.site as Record<string, unknown>).perguntas = 0;
    card(source);
    expect(screen.queryByRole("button", { name: "Revisar perguntas" })).not.toBeInTheDocument();
    expect(screen.getByText("Leitura concluída")).toBeInTheDocument();
    cleanup();
    expect(() => card(material({ source_metadata: { site: { url: 123 } } }))).not.toThrow();
  });
  it("revisão em outra aba bloqueia até terminar; lease vencido oferece retomar", () => {
    const source = material({ status: "building" });
    const site = source.source_metadata.site as Record<string, unknown>;
    site.revisaoToken = "55555555-5555-4555-8555-555555555555";
    site.revisaoInicio = new Date().toISOString();
    card(source);
    expect(screen.getByText("Salvando…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revisar perguntas" })).not.toBeInTheDocument();
    cleanup();
    site.revisaoInicio = new Date(Date.now() - 121_000).toISOString();
    card(source);
    expect(screen.getByRole("button", { name: "Revisar perguntas" })).toBeEnabled();
  });
});
