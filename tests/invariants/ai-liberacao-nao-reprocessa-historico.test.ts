import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

import { decidirElegibilidadeDaConversa } from "../../lib/ai/elegibilidade/consulta-pg";

if (!process.env.TEST_DB_CONTAINER) throw new Error("Rode via pnpm test:db");
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT}/postgres`,
});
const org = randomUUID();
const canal = randomUUID();
const contato = randomUUID();
const conversa = randomUUID();
const antiga = randomUUID();
const nova = randomUUID();

beforeAll(async () => {
  await pool.query(
    "insert into organizations(id,slug,legal_name,display_name) values($1::uuid,$1::text,'Teste','Teste')",
    [org],
  );
  await pool.query(
    "insert into channel_sessions(id,organization_id,waha_session_name,webhook_secret_encrypted,metadata) values($1,$2,$3,'\\x00','{\"ai_gate\":\"allowlist\",\"ai_gate_mode\":\"pre_go_live\"}')",
    [canal, org, `gate-${canal}`],
  );
  await pool.query(
    "insert into contacts(id,organization_id,phone_number) values($1,$2,'+5511987654321')",
    [contato, org],
  );
  await pool.query(
    "insert into conversations(id,organization_id,contact_id,channel_session_id) values($1,$2,$3,$4)",
    [conversa, org, contato, canal],
  );
  await pool.query(
    `insert into messages(id,organization_id,conversation_id,channel_session_id,contact_id,type,direction,created_at,sent_at)
     values($1,$2,$3,$4,$5,'text','inbound',now()-interval '1 hour',now()-interval '1 hour')`,
    [antiga, org, conversa, canal, contato],
  );
});

afterAll(async () => {
  await pool.query("delete from organizations where id=$1", [org]);
  await pool.end();
});

describe("liberar a IA não responde o histórico", () => {
  it("grava o marco e recusa mensagem anterior, mas aceita a próxima", async () => {
    await pool.query("select fn_configurar_pre_go_live_canal($1,$2,'open',$3)", [org, canal, []]);
    await pool.query(
      `insert into messages(id,organization_id,conversation_id,channel_session_id,contact_id,type,direction,created_at,sent_at)
       values($1,$2,$3,$4,$5,'text','inbound',now()+interval '1 second',now()+interval '1 second')`,
      [nova, org, conversa, canal, contato],
    );

    const anterior = await decidirElegibilidadeDaConversa(pool, {
      organizationId: org, conversationId: conversa, messageId: antiga,
      agora: new Date(), ttlMs: 86_400_000,
    });
    const posterior = await decidirElegibilidadeDaConversa(pool, {
      organizationId: org, conversationId: conversa, messageId: nova,
      agora: new Date(), ttlMs: 86_400_000,
    });
    const { rows } = await pool.query(
      "select metadata->>'ai_gate_started_at' as started_at from channel_sessions where id=$1",
      [canal],
    );

    expect(rows[0]?.started_at).toBeTruthy();
    expect(anterior).toMatchObject({ permite: false, motivo: "mensagem_anterior_a_liberacao" });
    expect(posterior).toMatchObject({ permite: true, motivo: "gate_aberto" });
    await expect(decidirElegibilidadeDaConversa(pool, {
      organizationId: org, conversationId: conversa, messageId: randomUUID(),
      agora: new Date(), ttlMs: 86_400_000,
    })).rejects.toThrow("mensagem não encontrada");
    expect((await pool.query(
      "select count(*)::int as n from messages where organization_id=$1 and direction='outbound'",
      [org],
    )).rows[0]?.n).toBe(0);
  });
});
