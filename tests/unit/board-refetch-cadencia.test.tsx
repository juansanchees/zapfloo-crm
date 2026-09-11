import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fronteiras = vi.hoisted(() => ({
  get: vi.fn(),
  ultimaEntrega: { current: null as number | null },
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: { get: fronteiras.get },
}));

vi.mock("@/hooks/realtime/useRealtimeChannel", () => ({
  useRealtimeChannel: () => ({
    status: "SUBSCRIBED",
    ultimaEntrega: fronteiras.ultimaEntrega,
  }),
}));

import { useBoard } from "@/hooks/kanban/useBoard";

function novoCliente() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY, gcTime: Infinity },
    },
  });
}

function wrapperDo(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

async function drenarPromessas() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("cadência do refetch de segurança do board", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fronteiras.get.mockReset();
    fronteiras.get.mockResolvedValue({ data: { leads: [] } });
    fronteiras.ultimaEntrega.current = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("mantém o refetch de 45s mesmo quando o board redesenha a cada segundo", async () => {
    const client = novoCliente();
    const { rerender } = renderHook(() => useBoard("pipeline-1"), {
      wrapper: wrapperDo(client),
    });
    await drenarPromessas();
    expect(fronteiras.get).toHaveBeenCalledTimes(1);
    fronteiras.get.mockClear();

    for (let segundo = 1; segundo < 45; segundo += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      rerender();
    }

    expect(
      fronteiras.get,
      "cada render reiniciou o relógio e adiou indefinidamente a rede de segurança",
    ).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    await drenarPromessas();

    expect(fronteiras.get).toHaveBeenCalledTimes(1);
    expect(fronteiras.get).toHaveBeenLastCalledWith(
      "/api/v1/pipelines/pipeline-1/board",
    );
  });

  it("troca a rede de segurança para a chave do novo pipeline", async () => {
    const client = novoCliente();
    const refetch = vi.spyOn(client, "refetchQueries");
    const { rerender } = renderHook(
      ({ pipelineId }: { pipelineId: string }) => useBoard(pipelineId),
      {
        initialProps: { pipelineId: "pipeline-1" },
        wrapper: wrapperDo(client),
      },
    );
    await drenarPromessas();

    rerender({ pipelineId: "pipeline-2" });
    await drenarPromessas();
    expect(client.getQueryState(["board", "pipeline-2"])).toBeDefined();
    refetch.mockClear();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(45_000);
    });
    await drenarPromessas();

    expect(refetch).toHaveBeenCalledWith({
      queryKey: ["board", "pipeline-2"],
      exact: true,
    });
  });
});
