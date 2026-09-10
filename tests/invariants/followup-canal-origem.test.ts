import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as InboundTurnModule from "@/lib/agent-engine/agent/inbound-turn";
import type * as FollowupTurnModule from "@/lib/agent-engine/agent/followup-turn";
import type { JobRow } from "@/lib/agent-engine/queue/queue";

// Só a execução de modelo é substituída. O handler e todas as consultas que
// escolhem o número rodam contra o baseline real do Postgres descartável.
const runAgentTurn = vi.fn(async () => undefined);
vi.mock("@/lib/agent-engine/agent/inbound-turn", async (original) => {
  const real = await original<typeof InboundTurnModule>();
  return { ...real, runAgentTurn };
});

if (!process.env.TEST_DB_CONTAINER || !process.env.TEST_DB_PORT) {
  throw new Error("Rode via scripts/test-db.sh: este teste exige Postgres local descartável.");
}
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${Number(process.env.TEST_DB_PORT)}/postgres`,
});
afterAll(() => pool.end());

let criarHandler: typeof FollowupTurnModule.createFollowupTurnHandler;
beforeAll(async () => {
  ({ createFollowupTurnHandler: criarHandler } = await import("@/lib/agent-engine/agent/followup-turn"));
});

const org = randomUUID();
const outraOrg = randomUUID();
const contato = randomUUID();
const outroContato = randomUUID();
const origem = randomUUID();
const recente = randomUUID();
const canalOrigem = randomUUID();
const canalRecente = randomUUID();
const enrollmentId = randomUUID();

beforeAll(async () => {
  for (const id of [org, outraOrg]) {
    await pool.query("insert into organizations(id, slug, legal_name, display_name) values ($1::uuid, $1::text, 'Teste origem', 'Teste origem')", [id]);
  }
  for (const id of [contato, outroContato]) {
    await pool.query("insert into contacts(id, organization_id, display_name) values ($1, $2, 'Contato de teste')", [id, org]);
  }
  for (const id of [canalOrigem, canalRecente]) {
    await pool.query("insert into channel_sessions(id, organization_id, waha_session_name, status, webhook_secret_encrypted) values ($1::uuid, $2, $1::text, 'WORKING', decode('00', 'hex'))", [id, org]);
  }
  for (const [id, canal, at] of [[origem, canalOrigem, "2026-09-01"], [recente, canalRecente, "2026-09-02"]]) {
    await pool.query("insert into conversations(id, organization_id, contact_id, channel_session_id, channel, is_group, last_message_at) values ($1, $2, $3, $4, 'whatsapp', false, $5)", [id, org, contato, canal, at]);
  }
  const version = randomUUID();
  const pointer = randomUUID();
  await pool.query("insert into followup_flow_versions(id, organization_id, graph) values ($1, $2, $3)", [version, org, { nodes: [], edges: [] }]);
  await pool.query("insert into followup_flow_pointers(id, organization_id, name, status, active_version_id) values ($1, $2, 'Origem', 'active', $3)", [pointer, org, version]);
  await pool.query("insert into followup_enrollments(id, organization_id, pointer_id, version_id, contact_id, conversation_id, current_node_id) values ($1, $2, $3, $4, $5, $6, 'enviar')", [enrollmentId, org, pointer, version, contato, origem]);
});

beforeEach(async () => {
  runAgentTurn.mockClear();
  await pool.query("update followup_enrollments set conversation_id = $1 where id = $2", [origem, enrollmentId]);
  await pool.query("update conversations set contact_id = $1 where id = $2", [contato, origem]);
  await pool.query("update channel_sessions set status = 'WORKING', archived_at = null where id = $1", [canalOrigem]);
});

function executar(over: Partial<JobRow> = {}) {
  const handler = criarHandler({
    completeFollowupTurn: async () => undefined,
    log: { info() {}, warn() {}, error() {} },
  } as never);
  return handler({
    id: randomUUID(), organization_id: org, contact_id: contato, kind: "followup_turn",
    payload: { followup_enrollment_id: enrollmentId, node_id: "enviar", purpose: "send_message" },
    ...over,
  } as JobRow, pool, { workerId: "teste-origem" });
}

describe("follow-up preserva número de origem — SQL de produção", () => {
  it("escolhe conversa antiga pinada mesmo havendo conversa nova em outro chip", async () => {
    await executar();
    expect(runAgentTurn).toHaveBeenCalledWith(expect.anything(), expect.anything(), pool, expect.anything(),
      expect.objectContaining({ conversationId: origem, channelSessionId: canalOrigem }));
  });

  it.each([
    { nome: "outra organização", over: { organization_id: outraOrg } },
    { nome: "outro contato", over: { contact_id: outroContato } },
  ])("enrollment não é alcançável pelo job de $nome", async ({ over }) => {
    await expect(executar(over)).rejects.toThrow(/inscrição.*não encontrada/i);
    expect(runAgentTurn).not.toHaveBeenCalled();
  });

  it("conversa que deixou de pertencer ao contato não autoriza fallback", async () => {
    await pool.query("update conversations set contact_id = $1 where id = $2", [outroContato, origem]);
    await expect(executar()).rejects.toThrow(/conversa de origem.*inválida/i);
    expect(runAgentTurn).not.toHaveBeenCalled();
  });

  it("número de origem desconectado não é substituído pelo outro número WORKING", async () => {
    await pool.query("update channel_sessions set status = 'STOPPED' where id = $1", [canalOrigem]);
    await expect(executar()).rejects.toThrow(/canal de origem.*indisponível/i);
    expect(runAgentTurn).not.toHaveBeenCalled();
  });

  it("sem conversa pinada conserva a conversa mais recente", async () => {
    await pool.query("update followup_enrollments set conversation_id = null where id = $1", [enrollmentId]);
    await executar();
    expect(runAgentTurn).toHaveBeenCalledWith(expect.anything(), expect.anything(), pool, expect.anything(),
      expect.objectContaining({ conversationId: recente, channelSessionId: canalRecente }));
  });
});
