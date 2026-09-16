import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/auth/AuthProvider", () => ({ usePermission: () => true }));

import { SkillsClient } from "@/app/app/ai/skills/_client";

describe("skills — gatilhos e quase ativações visíveis", () => {
  it("explica quando entra e mostra só a contagem do near-miss", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SkillsClient initialState={{
          installed: [{
            name: "negociacao",
            description: "Ajuda a responder objeções.",
            version_id: "v1",
            source: "manual",
            updated_at: "2026-09-16T12:00:00.000Z",
            triggers: ["caro", "desconto", "valor"],
            near_misses: 4,
          }],
          catalog: [],
        }} />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId("skill-gatilhos-negociacao")).toHaveTextContent(
      "Entra quando o cliente falar: caro, desconto, valor",
    );
    expect(screen.getByTestId("skill-quase-negociacao")).toHaveTextContent("Quase entrou 4 vezes");
    expect(screen.getByTestId("skill-quase-negociacao")).toHaveTextContent("sem revelar a conversa");
  });
});
