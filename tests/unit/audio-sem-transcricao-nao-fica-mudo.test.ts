import { describe, expect, it } from "vitest";

import { TEXTO_AUDIO_ILEGIVEL, ultimoInboundEhAudioComFalha } from "@/lib/agent-engine/agent/aviso-de-audio-ilegivel";
import type { LeadContext } from "@/lib/agent-engine/edge/crm/get-lead-context";

const base: LeadContext = {
  lead_id: "contato-1",
  contact: { name: null, phone: null, email: null, tags: [], is_blocked: false },
  conversation_id: "conversa-1",
  last_human_decision: null,
  messages: [],
};

describe("áudio cuja transcrição falhou", () => {
  it("é reconhecido para receber uma resposta determinística", () => {
    const context: LeadContext = {
      ...base,
      messages: [
        {
          direction: "inbound",
          body: "[audio]",
          sent_at: "2026-09-16T12:00:00-03:00",
          type: "audio",
          media_derived_status: "failed",
        },
      ],
    };

    expect(ultimoInboundEhAudioComFalha(context)).toBe(true);
    expect(TEXTO_AUDIO_ILEGIVEL).toMatch(/escreva.*envie o áudio novamente/i);
  });

  it("não intercepta áudio transcrito nem conversa humana comum", () => {
    expect(
      ultimoInboundEhAudioComFalha({
        ...base,
        messages: [
          {
            direction: "inbound",
            body: "conteúdo transcrito",
            sent_at: "2026-09-16T12:00:00-03:00",
            type: "audio",
            media_derived_status: "ready",
          },
        ],
      }),
    ).toBe(false);
  });
});
