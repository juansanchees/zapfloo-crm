import { describe, expect, it, vi } from "vitest";

import { generateFollowupDraft, parseFollowupDraft } from "./ai-draft";

const GRAFO_VALIDO = {
  nodes: [
    { id: "inicio", type: "trigger", label: "Início", position: { x: 80, y: 80 }, config: {} },
    {
      id: "mensagem",
      type: "action",
      label: "Enviar mensagem",
      position: { x: 80, y: 240 },
      config: { mode: "text", body: "Olá! Posso ajudar você a concluir seu pedido?" },
    },
    {
      id: "fim",
      type: "end",
      label: "Encerrar",
      position: { x: 80, y: 400 },
      config: { outcome: "custom", note: "Primeiro contato realizado" },
    },
  ],
  edges: [
    { id: "e1", source: "inicio", target: "mensagem", priority: 0, condition: { type: "always" } },
    { id: "e2", source: "mensagem", target: "fim", priority: 0, condition: { type: "always" } },
  ],
};

describe("rascunho de fluxo gerado por IA", () => {
  it("aceita JSON em bloco markdown e devolve somente um grafo publicável", () => {
    expect(parseFollowupDraft(`\n\`\`\`json\n${JSON.stringify(GRAFO_VALIDO)}\n\`\`\``)).toEqual(GRAFO_VALIDO);
  });

  it("recusa nó ou operador que o motor não conhece", () => {
    const ruim = structuredClone(GRAFO_VALIDO) as Record<string, unknown>;
    (ruim.nodes as Array<Record<string, unknown>>)[1]!.type = "enviar_pix";
    expect(() => parseFollowupDraft(JSON.stringify(ruim))).toThrow("ai_flow_invalid");
  });

  it("recusa grafo estruturalmente válido que deixaria um nó solto", () => {
    const ruim = structuredClone(GRAFO_VALIDO);
    ruim.edges = [ruim.edges[0]!];
    expect(() => parseFollowupDraft(JSON.stringify(ruim))).toThrow("ai_flow_not_publishable");
  });

  it("manda apenas a descrição operacional ao seam e valida a resposta antes de devolver", async () => {
    const modelCall = vi.fn(async () => ({ result: { text: JSON.stringify(GRAFO_VALIDO) } }));
    const graph = await generateFollowupDraft(
      { organizationId: "org-1", description: "Retome após 30 minutos e encerre depois da mensagem." },
      { pool: {} as never, cfg: {} as never, modelCall: modelCall as never },
    );

    expect(graph).toEqual(GRAFO_VALIDO);
    expect(modelCall).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ tenantId: "org-1", purpose: "followup_generate_draft" }),
    );
    const callArgs = modelCall.mock.calls[0] as unknown as [unknown, unknown, unknown];
    expect(JSON.stringify(callArgs[2])).toContain("Retome após 30 minutos");
  });
});
