import http from "node:http";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { subirPostgrestLocal, type PostgrestLocal } from "../db/postgrest-local";
import { createFollowupTurnHandler } from "@/lib/agent-engine/agent/followup-turn";
import { claimJobs, completeJob, enqueueJob, failJob, type JobRow } from "@/lib/agent-engine/queue/queue";
import { reconcileSessions, redriveQueued, type WatchdogConfig } from "@/lib/agent-engine/edge/crm/session-reconciler";
import { completeTurnForEnrollment, createPgAdminClient } from "@/lib/followup/turn-bridge";
import { createAdminClient } from "@/lib/supabase/admin";

// Só a fábrica de conexão da auditoria é redirecionada: consultas, RPCs,
// guardrails, adapter, ledger, envio e ponte do enrollment são produção real.
// O receiver HTTP substitui o provedor externo; nenhuma chamada de IA é feita.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

if (!process.env.TEST_DB_CONTAINER || !process.env.TEST_DB_PORT) {
  throw new Error("Rode via scripts/test-db.sh: este teste exige Postgres descartável.");
}
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${Number(process.env.TEST_DB_PORT)}/postgres`,
  max: 4,
});
const log = { info() {}, warn() {}, error() {} };
const workerId = "followup-reconexao";
const body = "Olá, podemos continuar nossa conversa?";
const clock = () => new Date("2026-09-10T15:00:00Z");
let rest: PostgrestLocal | undefined;
let admin: SupabaseClient;
let receiver: http.Server | undefined;
let config: WatchdogConfig;
let sessions: Array<{ name: string; status: string }> = [];
const delivered: Array<{ session: string; chatId: string; text: string }> = [];

beforeAll(async () => {
  rest = await subirPostgrestLocal();
  admin = rest.cliente("service_role");
  vi.mocked(createAdminClient).mockReturnValue(admin);
  receiver = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.method === "GET" && req.url === "/api/sessions?all=true") {
      res.end(JSON.stringify(sessions));
      return;
    }
    if (req.method === "POST" && req.url === "/api/sendText") {
      let data = "";
      req.on("data", (chunk) => { data += String(chunk); });
      req.on("end", () => {
        delivered.push(JSON.parse(data) as (typeof delivered)[number]);
        res.writeHead(201);
        res.end(JSON.stringify({ id: { id: `reconexao-${delivered.length}` } }));
      });
      return;
    }
    res.writeHead(404);
    res.end("{}");
  });
  await new Promise<void>((resolve) => receiver!.listen(0, "127.0.0.1", resolve));
  const address = receiver.address();
  if (address === null || typeof address === "string") throw new Error("Receiver sem porta local.");
  config = {
    wahaBaseUrl: `http://127.0.0.1:${address.port}`,
    wahaApiKey: "chave-sintetica-followup",
    intervalMs: 1000,
    redriveMinAgeMs: 0,
    redriveBatchSize: 10,
    redriveSpacingMs: 0,
  };
  vi.stubEnv("WAHA_API_BASE_URL", config.wahaBaseUrl);
  vi.stubEnv("WAHA_API_KEY", config.wahaApiKey);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  if (receiver) await new Promise<void>((resolve, reject) => receiver!.close((error) => error ? reject(error) : resolve()));
  await rest?.encerrar();
  await pool.end();
});

async function fixture(status: string) {
  const org = randomUUID();
  const contact = randomUUID();
  const channel = randomUUID();
  const newerChannel = randomUUID();
  const conversation = randomUUID();
  const newerConversation = randomUUID();
  const version = randomUUID();
  const pointer = randomUUID();
  const enrollment = randomUUID();
  await pool.query("insert into organizations(id, slug, legal_name, display_name) values ($1::uuid, $1::text, 'Reconexão teste', 'Reconexão teste')", [org]);
  await pool.query("insert into contacts(id, organization_id, name, phone_number) values ($1, $2, 'Contato sintético', '+5511900000777')", [contact, org]);
  for (const [id, state] of [[channel, status], [newerChannel, "WORKING"]]) {
    await pool.query("insert into channel_sessions(id, organization_id, waha_session_name, status, webhook_secret_encrypted) values ($1::uuid, $2, $1::text, $3, decode('00', 'hex'))", [id, org, state]);
  }
  for (const [id, session, date] of [[conversation, channel, "2026-09-01"], [newerConversation, newerChannel, "2026-09-02"]]) {
    await pool.query("insert into conversations(id, organization_id, contact_id, channel_session_id, channel, is_group, last_message_at) values ($1, $2, $3, $4, 'whatsapp', false, $5)", [id, org, contact, session, date]);
  }
  const graph = {
    nodes: [
      { id: "enviar", type: "action", label: "Retomar", position: { x: 0, y: 0 }, config: { mode: "text", body } },
      { id: "fim", type: "end", label: "Fim", position: { x: 0, y: 1 }, config: { outcome: "exhausted" } },
    ],
    edges: [{ id: "enviar-fim", source: "enviar", target: "fim", priority: 0, condition: { type: "always" } }],
  };
  await pool.query("insert into followup_flow_versions(id, organization_id, graph) values ($1, $2, $3)", [version, org, graph]);
  await pool.query("insert into followup_flow_pointers(id, organization_id, name, status, active_version_id) values ($1, $2, 'Reconexão', 'active', $3)", [pointer, org, version]);
  await pool.query("insert into followup_enrollments(id, organization_id, pointer_id, version_id, contact_id, conversation_id, current_node_id) values ($1, $2, $3, $4, $5, $6, 'enviar')", [enrollment, org, pointer, version, contact, conversation]);
  return { org, contact, channel, newerChannel, conversation, newerConversation, enrollment };
}

function handler() {
  return createFollowupTurnHandler({
    crmCfg: { supabase: admin },
    llmCfg: {},
    knobs: {
      historyLimit: 10, maxContextTokens: 1000, notesIndexMaxTokens: 500,
      maxSteps: 4, queuedRetryDelayMs: 1000,
      breaker: {
        exactFailureWarn: 2, exactFailureBlock: 5, sameToolFailureWarn: 3,
        sameToolFailureHalt: 8, noProgressWarn: 3, noProgressBlock: 5,
      },
    },
    log,
    clock,
    sleep: async () => {},
    completeFollowupTurn: (db, input) => completeTurnForEnrollment(
      createPgAdminClient(db), input.organizationId, input.enrollmentId, input.nodeId, input.result, clock,
    ),
  });
}

/** Contrato de runJob do worker: handler resolveu → complete; lançou → fail.
 * O backoff só é acelerado nos dados do teste para medir as cinco tentativas
 * sem dormir 150s. A guarda defeituosa leva a dead; a correção termina em done
 * na primeira tentativa, deixando o resgate da mensagem para o watchdog. */
async function runToSettlement(f: Awaited<ReturnType<typeof fixture>>) {
  const { job } = await enqueueJob(pool, f.org, {
    kind: "followup_turn", leadId: f.contact,
    payload: { followup_enrollment_id: f.enrollment, node_id: "enviar", purpose: "send_message", fixed_body: body },
  });
  let error: unknown = null;
  let state: JobRow = job;
  const run = handler();
  for (let attempt = 0; attempt < job.max_attempts; attempt += 1) {
    await pool.query("update job_queue set run_after = now() where id = $1 and status = 'pending'", [job.id]);
    const [claimed] = await claimJobs(pool, { workerId, maxConcurrency: 1 });
    expect(claimed?.id).toBe(job.id);
    try {
      await run(claimed!, pool, { workerId });
      await completeJob(pool, job.id, workerId);
    } catch (caught) {
      error = caught;
      await failJob(pool, job.id, workerId, caught);
    }
    state = (await pool.query<JobRow>("select * from job_queue where id = $1", [job.id])).rows[0]!;
    if (state.status !== "pending") break;
  }
  return { state, error };
}

describe("follow-up pinado atravessa reconexão pela fila de mensagens existente", () => {
  it.each(["STARTING", "SCAN_QR_CODE"])("%s: queued, job done e resgate WORKING no mesmo número", async (status) => {
    const f = await fixture(status);
    const before = delivered.length;
    const { state, error } = await runToSettlement(f);
    expect(state).toMatchObject({ status: "done", attempts: 1 });
    expect(error).toBeNull();
    const messages = await pool.query("select id, status, channel_session_id, conversation_id, sent_via, body, metadata from messages where organization_id = $1", [f.org]);
    expect(messages.rows).toHaveLength(1);
    const message = messages.rows[0]!;
    expect(message).toMatchObject({
      status: "queued", channel_session_id: f.channel, conversation_id: f.conversation,
      sent_via: "ai", body, metadata: { queued_reason: "channel_session_not_working" },
    });
    expect((await pool.query("select status, crm_message_id from send_ledger where job_id = $1", [state.id])).rows)
      .toEqual([{ status: "queued", crm_message_id: message.id }]);
    expect((await pool.query("select id from agent_inbox_items where organization_id = $1 and kind = 'job_dead'", [f.org])).rows).toEqual([]);
    expect((await pool.query("select status, current_node_id, conversation_id from followup_enrollments where id = $1", [f.enrollment])).rows)
      .toEqual([{ status: "active", current_node_id: "fim", conversation_id: f.conversation }]);
    expect((await pool.query("select metadata->>'status' as status from api_audit_log where organization_id = $1 and action = 'message.sent'", [f.org])).rows)
      .toEqual([{ status: "queued" }]);
    expect(delivered).toHaveLength(before);
    expect(await redriveQueued(pool, config, log)).toBe(0);
    expect(delivered).toHaveLength(before);

    sessions = [{ name: f.channel, status: "WORKING" }];
    expect(await reconcileSessions(pool, config, log)).toBe(1);
    expect(await redriveQueued(pool, config, log)).toBe(1);
    expect(delivered.slice(before)).toEqual([{ session: f.channel, chatId: "5511900000777@c.us", text: body }]);
    expect((await pool.query("select id, status, channel_session_id, conversation_id, external_id, metadata->>'redrive' as redrive from messages where organization_id = $1", [f.org])).rows)
      .toEqual([{ id: message.id, status: "sent", channel_session_id: f.channel, conversation_id: f.conversation, external_id: `reconexao-${before + 1}`, redrive: "watchdog" }]);
    expect(await redriveQueued(pool, config, log)).toBe(0);
    expect(delivered).toHaveLength(before + 1);
    expect((await pool.query("select status, attempts from job_queue where id = $1", [state.id])).rows)
      .toEqual([{ status: "done", attempts: 1 }]);
  });

  it.each(["arquivado", "outra organização", "inexistente"])("recusa canal %s sem mensagem nem fallback para o número recente", async (kind) => {
    const f = await fixture("WORKING");
    if (kind === "arquivado") {
      await pool.query("update channel_sessions set archived_at = now() where id = $1", [f.channel]);
    } else if (kind === "outra organização") {
      const other = await fixture("WORKING");
      await pool.query("update conversations set channel_session_id = $1 where id = $2", [other.channel, f.conversation]);
    } else {
      // Somente a fixture órfã ignora FK nesta transação. Não altera o schema:
      // mede o guard defensivo que também protege clones com dado legado.
      const tx = await pool.connect();
      try {
        await tx.query("begin");
        await tx.query("set local session_replication_role = replica");
        await tx.query("update conversations set channel_session_id = $1 where id = $2", [randomUUID(), f.conversation]);
        await tx.query("commit");
      } catch (error) {
        await tx.query("rollback");
        throw error;
      } finally {
        tx.release();
      }
    }
    const before = delivered.length;
    const { state, error } = await runToSettlement(f);
    expect((error as Error | null)?.message).toMatch(kind === "arquivado" ? /canal arquivado/i : /canal de origem.*indisponível/i);
    expect((await pool.query("select id from messages where organization_id = $1", [f.org])).rows).toEqual([]);
    expect((await pool.query("select id from send_ledger where job_id = $1", [state.id])).rows).toEqual([]);
    expect((await pool.query("select current_node_id, conversation_id from followup_enrollments where id = $1", [f.enrollment])).rows)
      .toEqual([{ current_node_id: "enviar", conversation_id: f.conversation }]);
    expect(delivered).toHaveLength(before);
  });
});
