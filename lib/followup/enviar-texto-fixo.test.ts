/**
 * R1 — o envio INLINE de texto fixo do follow-up (`enviarTextoFixoPendente`, o
 * atalho "sem cron e sem agent-worker") BYPASSA `executarTurnoDoAgente`, então
 * precisa do gate de elegibilidade por conta própria. Sem isto, um fluxo de
 * follow-up com nó de texto fixo mandaria mensagem para uma conversa que o gate
 * `allowlist` barra.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMessageHandler = vi.fn(async (..._a: unknown[]) => ({ id: "msg-1" }));
const decidir = vi.fn();
const completeTurnForEnrollment = vi.fn(async (..._a: unknown[]) => {});

vi.mock("@/app/api/v1/messages/_handler", () => ({ sendMessageHandler: (...a: unknown[]) => sendMessageHandler(...a) }));
vi.mock("@/lib/automation/start-conversation", () => ({
  ensureConversation: async () => "conv-1",
  sessaoProntaParaEnvio: async () => "sess-1",
}));
vi.mock("@/lib/ai/elegibilidade/consulta-supabase", () => ({
  decidirElegibilidadeDaConversaViaSupabase: (...a: unknown[]) => decidir(...a),
}));
vi.mock("@/lib/followup/turn-bridge", () => ({
  completeTurnForEnrollment: (...a: unknown[]) => completeTurnForEnrollment(...a),
}));
vi.mock("@/lib/followup/engine", () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { enviarTextoFixoPendente } from "./enviar-texto-fixo";

const JOB = {
  id: "job-1",
  organization_id: "org-1",
  contact_id: "contact-1",
  payload: { fixed_body: "Oi, tudo bem?", followup_enrollment_id: "enr-1", node_id: "node-1" },
};

const statusUpdates: string[] = [];

/** Admin stub: job_queue (select pending / claim / status) + followup_enrollments. */
function admin(opts: {
  conversationId?: string | null;
  conversaAusente?: boolean;
  canalAusente?: boolean;
  status?: string;
  archivedAt?: string | null;
} = {}) {
  const make = (table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      _table: table,
      _upd: null as Record<string, unknown> | null,
      _filters: {} as Record<string, unknown>,
      select: () => chain,
      eq: (key: string, value: unknown) => { chain._filters[key] = value; return chain; },
      order: () => chain,
      limit: () => chain,
      update: (p: Record<string, unknown>) => {
        chain._upd = p;
        if (table === "job_queue" && typeof p.status === "string") statusUpdates.push(p.status);
        return chain;
      },
      maybeSingle: () => {
        if (table === "job_queue" && chain._upd) return Promise.resolve({ data: { id: JOB.id }, error: null });
        if (table === "followup_enrollments")
          return Promise.resolve({ data: { current_node_id: "node-1", conversation_id: opts.conversationId ?? null }, error: null });
        if (table === "conversations") {
          expect(chain._filters).toMatchObject({ id: "conv-origem", organization_id: "org-1", contact_id: "contact-1", is_group: false });
          return Promise.resolve({ data: opts.conversaAusente ? null : { id: "conv-origem", channel_session_id: opts.canalAusente ? null : "sess-origem" }, error: null });
        }
        if (table === "channel_sessions") {
          expect(chain._filters).toMatchObject({ id: "sess-origem", organization_id: "org-1" });
          return Promise.resolve({ data: { id: "sess-origem", status: opts.status ?? "WORKING", archived_at: opts.archivedAt ?? null }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      then: (r: (v: unknown) => unknown) => {
        if (table === "job_queue" && !chain._upd) {
          return Promise.resolve({ data: [JOB], error: null }).then(r);
        }
        return Promise.resolve({ data: null, error: null }).then(r);
      },
    };
    return chain;
  };
  return { from: (t: string) => make(t) } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  statusUpdates.length = 0;
});

describe("enviarTextoFixoPendente · número de origem", () => {
  it("texto fixo sai pela conversa vinculada mesmo com outra sessão disponível", async () => {
    decidir.mockResolvedValue({ permite: true });
    const enviados = await enviarTextoFixoPendente(admin({ conversationId: "conv-origem" }));
    expect(enviados).toBe(1);
    expect(sendMessageHandler).toHaveBeenCalledWith(expect.anything(), expect.anything(),
      expect.objectContaining({ conversation_id: "conv-origem" }));
    expect(decidir).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ conversationId: "conv-origem" }));
  });

  it.each([
    { nome: "conversa inexistente ou de outro contato", opts: { conversaAusente: true } },
    { nome: "conversa sem canal", opts: { canalAusente: true } },
    { nome: "canal desconectado", opts: { status: "STOPPED" } },
    { nome: "canal arquivado", opts: { archivedAt: "2026-09-01T10:00:00Z" } },
  ])("$nome: mantém job pendente sem enviar pelo outro chip", async ({ opts }) => {
    decidir.mockResolvedValue({ permite: true });
    const enviados = await enviarTextoFixoPendente(admin({ conversationId: "conv-origem", ...opts }));
    expect(enviados).toBe(0);
    expect(sendMessageHandler).not.toHaveBeenCalled();
    expect(statusUpdates).toContain("pending");
    expect(completeTurnForEnrollment).not.toHaveBeenCalled();
  });
});

describe("enviarTextoFixoPendente · gate de elegibilidade", () => {
  it("conversa NÃO elegível → NÃO envia, job vira 'done'", async () => {
    decidir.mockResolvedValue({ permite: false, motivo: "sem_autorizacao", bloqueioPorAllowlist: true });
    const enviados = await enviarTextoFixoPendente(admin());
    expect(enviados).toBe(0);
    expect(sendMessageHandler).not.toHaveBeenCalled();
    expect(statusUpdates).toContain("done");
  });

  it("conversa elegível → envia normalmente", async () => {
    decidir.mockResolvedValue({ permite: true, motivo: "autorizado", bloqueioPorAllowlist: false });
    const enviados = await enviarTextoFixoPendente(admin());
    expect(enviados).toBe(1);
    expect(sendMessageHandler).toHaveBeenCalledOnce();
  });

  it("erro ao ler elegibilidade → NÃO envia, job volta pra 'pending' (fail-closed)", async () => {
    decidir.mockRejectedValue(new Error("db down"));
    const enviados = await enviarTextoFixoPendente(admin());
    expect(enviados).toBe(0);
    expect(sendMessageHandler).not.toHaveBeenCalled();
    expect(statusUpdates).toContain("pending");
  });
});
