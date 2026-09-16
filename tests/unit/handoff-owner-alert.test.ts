import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMessage = vi.fn(async (..._args: unknown[]) => ({}));
const checkContactExists = vi.fn(async (..._args: unknown[]) => ({
  numberExists: true,
  chatId: "5511999999999@c.us",
}));
const quemPodeAssumirAgora = vi.fn(async (..._args: unknown[]) => ({ disponiveis: 0, total: 1 }));
const recordSend = vi.fn(async (..._args: unknown[]) => {});
const adminUpdates: unknown[] = [];
const queries: string[] = [];
let assignedTo: string | null = null;
let channelStatus = "WORKING";

const db = {
  async query(sql: string) {
    queries.push(sql);
    if (sql.includes("from conversations c")) {
      return {
        rows: [
          {
            settings: { routing: { owner_phone: "5511888888888", handoff_reminder_minutes: 10 } },
            status: "pending",
            assigned_to_user_id: assignedTo,
            phone_number: "5511977771234",
            channel_session_id: "sessao-1",
            channel_status: channelStatus,
            channel_session: { provider: "waha", waha_session_name: "sessao-waha" },
            daily_message_limit: 1000,
          },
        ],
      };
    }
    return { rows: [] };
  },
};

vi.mock("@/lib/agent-engine/db/pool", () => ({ createPool: () => db }));
vi.mock("@/lib/escalacao/disponibilidade", () => ({
  quemPodeAssumirAgora: (...args: unknown[]) => quemPodeAssumirAgora(...args),
}));
vi.mock("@/lib/agent-engine/pacing/store", () => ({
  loadChannelKnobs: async () => ({
    knobs: {
      throttleMs: 0,
      jitterMaxMs: 0,
      windowStartHour: 0,
      windowEndHour: 24,
      allowSunday: true,
      timezone: "UTC",
      warmupDailyCaps: [],
    },
    numberActivatedAt: null,
  }),
  loadPacingState: async () => ({ lastSentAt: null, sentToday: 0, numberActivatedAt: null }),
  recordSend: (...args: unknown[]) => recordSend(...args),
}));
vi.mock("@/lib/agent-engine/pacing/engine", () => ({
  decidePacing: () => ({ allow: true, waitMs: 0 }),
}));
vi.mock("@/lib/channels", () => ({
  getAdapter: () => ({
    isConfigured: () => true,
    codes: { notConfigured: "canal_nao_configurado" },
    resolveRecipient: () => "5511888888888@c.us",
    send: (...args: unknown[]) => sendMessage(...args),
  }),
  resolveSessionRef: () => "sessao-waha",
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      update(payload: unknown) {
        adminUpdates.push(payload);
        const chain: Record<string, unknown> = {};
        chain.eq = () => chain;
        chain.then = (resolve: (value: unknown) => void) => Promise.resolve({ error: null }).then(resolve);
        return chain;
      },
    }),
  }),
}));

const EVENTO = {
  id: "evento-1",
  organization_id: "org-1",
  event_type: "handoff.owner_alert_requested",
  entity_kind: "conversation",
  entity_id: "conversa-1",
  payload: { conversation_id: "conversa-1", phase: "initial" },
  metadata: {},
  consumed_by: [],
  attempts: 0,
};

describe("aviso ao dono no handoff", () => {
  beforeEach(() => {
    sendMessage.mockClear();
    checkContactExists.mockClear();
    quemPodeAssumirAgora.mockClear();
    quemPodeAssumirAgora.mockResolvedValue({ disponiveis: 0, total: 1 });
    recordSend.mockClear();
    adminUpdates.length = 0;
    queries.length = 0;
    assignedTo = null;
    channelStatus = "WORKING";
  });

  it("avisa uma vez e agenda uma cobrança quando ninguém está disponível", async () => {
    const { handleHandoffOwnerAlert } = await import("@/workers/handoff-owner-alert-worker");
    const result = await handleHandoffOwnerAlert(EVENTO);

    expect(result.status).toBe("ok");
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const envio = sendMessage.mock.calls[0]?.[0] as { body?: string } | undefined;
    expect(envio?.body).toMatch(/\+5511 \*\*\*\*\*-1234 — há 0 min/);
    expect(queries.some((sql) => sql.includes("payload->>'phase' = 'reminder'"))).toBe(true);
  });

  it("não avisa quando já existe alguém disponível", async () => {
    quemPodeAssumirAgora.mockResolvedValue({ disponiveis: 1, total: 1 });
    const { handleHandoffOwnerAlert } = await import("@/workers/handoff-owner-alert-worker");
    const result = await handleHandoffOwnerAlert(EVENTO);
    expect(result).toMatchObject({ status: "skipped", detail: "há atendente disponível" });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("a cobrança não sai se alguém assumiu antes do prazo", async () => {
    assignedTo = "usuario-1";
    const { handleHandoffOwnerAlert } = await import("@/workers/handoff-owner-alert-worker");
    const result = await handleHandoffOwnerAlert({
      ...EVENTO,
      payload: { conversation_id: "conversa-1", phase: "reminder" },
    });
    expect(result).toMatchObject({ status: "skipped", detail: "conversa já assumida" });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("registra erro e não envia quando o canal está fora do ar", async () => {
    channelStatus = "FAILED";
    const { handleHandoffOwnerAlert } = await import("@/workers/handoff-owner-alert-worker");
    const result = await handleHandoffOwnerAlert(EVENTO);
    expect(result).toMatchObject({
      status: "error",
      detail: "canal fora do ar para avisar o dono",
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
