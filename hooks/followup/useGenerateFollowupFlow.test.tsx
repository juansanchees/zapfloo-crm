import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useGenerateFollowupFlow } from "./useFollowupFlows";

vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
const input = { name: "Boas-vindas", description: "Espere uma hora, envie uma mensagem e encerre." };

function mount() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return renderHook(() => useGenerateFollowupFlow(), {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("aguarda uma geração de 12 segundos sem abortar ou repetir o POST", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn((_url: string, opts: RequestInit) => new Promise<Response>((resolve, reject) => {
    const timer = setTimeout(() => resolve(new Response(JSON.stringify({ data: { id: "draft-1", status: "draft" } }))), 12_000);
    opts.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("aborted", "AbortError")); });
  }));
  vi.stubGlobal("fetch", fetch);
  const { result } = mount();
  let operation!: Promise<unknown>;
  act(() => { operation = result.current.mutateAsync(input); });
  await act(async () => { await vi.advanceTimersByTimeAsync(12_100); });
  expect(fetch).toHaveBeenCalledTimes(1);
  await expect(operation).resolves.toMatchObject({ id: "draft-1", status: "draft" });
});

it("não repete geração cobrável quando o servidor recusa a credencial", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ error: { code: "ai_credential_error", message: "Credencial recusada" } }), { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  const { result } = mount();
  await act(async () => {
    await expect(result.current.mutateAsync(input)).rejects.toMatchObject({ code: "ai_credential_error" });
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});
