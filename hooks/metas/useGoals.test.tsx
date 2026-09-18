import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { apiClient } from "@/lib/api/client";
import { GOAL_PROGRESS_QUERY_KEY } from "./useGoalProgress";
import { goalsQueryKey, useUpdateGoals } from "./useGoals";

vi.mock("@/lib/api/client", () => ({ apiClient: { patch: vi.fn() } }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));

const scope = { orgId: "org-a", userId: "user-a", role: "manager" };

describe("cache de metas", () => {
  it("muda por organização, pessoa e papel", () => {
    for (const changed of [{ orgId: "org-b" }, { userId: "user-b" }, { role: "agent" }]) {
      expect(goalsQueryKey(scope)).not.toEqual(goalsQueryKey({ ...scope, ...changed }));
      expect(GOAL_PROGRESS_QUERY_KEY(scope)).not.toEqual(GOAL_PROGRESS_QUERY_KEY({ ...scope, ...changed }));
    }
  });

  it("salvar invalida configuração e progresso do mesmo escopo", async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { team: {}, members: {} } } as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useUpdateGoals(scope), { wrapper });
    await act(async () => { await result.current.mutateAsync({ team: {}, members: {} }); });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: goalsQueryKey(scope) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: GOAL_PROGRESS_QUERY_KEY(scope) });
  });
});
