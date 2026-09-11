import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

import { PipelinePageClient } from "@/app/app/pipelines/[id]/_client";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";

const estado = vi.hoisted(() => ({ divergencias: 0 }));
vi.mock("@/hooks/kanban/useBoard", () => ({ useBoard: () => ({
  data: { pipeline: { id: "funil", name: "Funil de teste" }, leads: [], stages: [] },
  isLoading: false, error: null, pulses: new Map(), realtimeStatus: "subscribed",
  seguranca: { divergencias: estado.divergencias, ultimaDivergencia: null, ultimaVerificacao: 1 },
}) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/app/pipelines/funil", useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/kanban/KanbanBoard", () => ({ KanbanBoard: () => null }));
vi.mock("@/components/kanban/FilterBar", () => ({ FilterBar: () => null }));
vi.mock("@/components/kanban/BulkActionBar", () => ({ BulkActionBar: () => null }));
vi.mock("@/components/kanban/NewLeadDialog", () => ({ NewLeadDialog: () => null }));

function montar(locale: "pt-BR" | "es" = "pt-BR") {
  return render(<IdiomaProvider locale={locale}><PipelinePageClient pipelineId="funil" initialName="Funil de teste" /></IdiomaProvider>);
}

describe("aviso de perda detectada no funil", () => {
  beforeEach(() => { estado.divergencias = 0; });

  it("não simula uma falha enquanto o detector não encontrou divergência", () => {
    montar();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("explica a perda e a recuperação reais, mesmo com a assinatura ativa", () => {
    estado.divergencias = 1;
    montar();
    expect(screen.getByRole("status")).toHaveTextContent("Uma atualização não chegou em tempo real. Recuperamos os dados pela verificação de segurança; novas alterações podem demorar para aparecer.");
  });

  it("traduz o aviso sem inventar outra detecção", () => {
    estado.divergencias = 2;
    montar("es");
    expect(screen.getByRole("status")).toHaveTextContent("Una actualización no llegó en tiempo real. Recuperamos los datos mediante la verificación de seguridad; los nuevos cambios pueden tardar en aparecer.");
  });
});
