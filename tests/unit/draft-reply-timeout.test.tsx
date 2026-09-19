import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DraftReplyButton } from "@/components/inbox/composer/DraftReplyButton";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("tempo do rascunho de IA", () => {
  it("entrega uma resposta de 12s sem abortar nem repetir a chamada faturável", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      (_url: string, opts: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          const timer = setTimeout(
            () => resolve(Response.json({ data: { suggestions: ["Resposta após análise."] } })),
            12_000,
          );
          opts.signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const onSuggestions = vi.fn();

    render(
      <QueryClientProvider client={new QueryClient()}>
        <DraftReplyButton conversationId="conv-12s" onSuggestions={onSuggestions} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sugerir resposta" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_100);
    });

    expect(onSuggestions).toHaveBeenCalledWith(["Resposta após análise."]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
