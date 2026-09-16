import { describe, expect, it, vi } from "vitest";

import { comPresencaDeDigitacao } from "@/lib/agent-engine/agent/presenca-de-digitacao";
import type { ChannelAdapter } from "@/lib/agent-engine/channel-adapter";

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never;

function canal(chamadas: boolean[]): ChannelAdapter {
  return {
    channel: "teste",
    send: vi.fn() as never,
    sessionHealth: vi.fn() as never,
    capabilities: () => ({ freeformAnytime: true, serviceWindowHours: null }),
    costPerMessage: () => ({ perMessageUsdCents: 0, model: "flat" }),
    setTyping: async ({ active }) => {
      chamadas.push(active);
    },
  };
}

describe("presença de digitação", () => {
  it("começa no turno e para quando a resposta termina", async () => {
    const chamadas: boolean[] = [];
    const resultado = await comPresencaDeDigitacao(
      canal(chamadas),
      { conversationId: "c", channelSessionId: "s" },
      async () => "ok",
      { log },
    );
    expect(resultado).toBe("ok");
    expect(chamadas).toEqual([true, false]);
  });

  it("para também quando o turno falha", async () => {
    const chamadas: boolean[] = [];
    await expect(
      comPresencaDeDigitacao(
        canal(chamadas),
        { conversationId: "c", channelSessionId: "s" },
        async () => {
          throw new Error("provedor fora");
        },
        { log },
      ),
    ).rejects.toThrow("provedor fora");
    expect(chamadas).toEqual([true, false]);
  });

  it("aplica o teto mesmo se o turno ainda estiver preso", async () => {
    vi.useFakeTimers();
    const chamadas: boolean[] = [];
    let liberar!: () => void;
    const preso = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    const execucao = comPresencaDeDigitacao(
      canal(chamadas),
      { conversationId: "c", channelSessionId: "s" },
      () => preso,
      { log, tetoMs: 50 },
    );
    await vi.advanceTimersByTimeAsync(51);
    expect(chamadas).toEqual([true, false]);
    liberar();
    await execucao;
    expect(chamadas).toEqual([true, false]);
    vi.useRealTimers();
  });
});
