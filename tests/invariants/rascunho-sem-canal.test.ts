import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

if (!process.env.TEST_DB_CONTAINER) throw new Error("Execute via pnpm test:db (Postgres efêmero).");
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? "54329"}/postgres`,
  max: 2,
});
const orgA = randomUUID();
const orgB = randomUUID();
const agente = randomUUID();
const usuarioA = randomUUID();
const usuarioB = randomUUID();
let numero = 0;

beforeAll(async () => {
  for (const [org, user, slug] of [[orgA, usuarioA, "rascunho-a"], [orgB, usuarioB, "rascunho-b"]]) {
    await pool.query("insert into auth.users(id,email) values($1,$2)", [user, `${slug}@example.test`]);
    await pool.query("insert into organizations(id,slug,legal_name,display_name) values($1,$2,'QA','QA')", [org, slug]);
    await pool.query("insert into user_organizations(user_id,organization_id,role,accepted_at) values($1,$2,'admin',now())", [user, org]);
  }
  await pool.query("insert into ai_agents(id,organization_id,name,system_prompt,kind,is_active) values($1,$2,'Rascunho QA','Contexto sintético','mcp_agent',false)", [agente, orgA]);
});
afterAll(async () => { await pool.end(); });

async function rascunho(canal: string | null = null): Promise<string> {
  const id = randomUUID();
  await pool.query(`insert into ai_agent_versions
    (id,organization_id,agent_id,version_number,system_prompt,provider,model,channel_session_id,status)
    values($1,$2,$3,$4,'Contexto sintético','openai','modelo-sintetico',$5,'draft')`,
  [id, orgA, agente, ++numero, canal]);
  return id;
}

describe("rascunho sem canal não vira atendimento publicado", () => {
  it("persiste sem canal e mantém agente inativo e sem versão publicada", async () => {
    const id = await rascunho();
    const { rows } = await pool.query(`select v.status,v.channel_session_id,a.is_active,a.published_version_id
      from ai_agent_versions v join ai_agents a on a.id=v.agent_id where v.id=$1`, [id]);
    expect(rows).toEqual([{ status: "draft", channel_session_id: null, is_active: false, published_version_id: null }]);
  });
  it.each(["published", "superseded"])("não aceita %s sem canal nem por escrita direta", async (status) => {
    const id = await rascunho();
    await expect(pool.query("update ai_agent_versions set status=$1 where id=$2", [status, id]))
      .rejects.toMatchObject({ code: "23514", constraint: "ai_agent_versions_canal_ao_publicar" });
  });
  it("permite arquivar um rascunho sem inventar canal", async () => {
    const id = await rascunho();
    const { rows } = await pool.query("update ai_agent_versions set status='archived' where id=$1 returning status,channel_session_id", [id]);
    expect(rows).toEqual([{ status: "archived", channel_session_id: null }]);
  });
  it("preserva publicação com canal existente", async () => {
    const canal = randomUUID();
    await pool.query("insert into channel_sessions(id,organization_id,waha_session_name,webhook_secret_encrypted) values($1,$2,'rascunho-qa','\\x00'::bytea)", [canal, orgA]);
    const id = await rascunho(canal);
    const { rows } = await pool.query("update ai_agent_versions set status='published' where id=$1 returning channel_session_id", [id]);
    expect(rows).toEqual([{ channel_session_id: canal }]);
    // O trigger de imutabilidade anterior ao CHECK também deve permanecer.
    await expect(pool.query("update ai_agent_versions set channel_session_id=null where id=$1", [id]))
      .rejects.toThrow(/imutável/);
    const { rows: intacta } = await pool.query("select channel_session_id,status from ai_agent_versions where id=$1", [id]);
    expect(intacta).toEqual([{ channel_session_id: canal, status: "published" }]);
  });
  it("RLS mantém o rascunho visível somente à sua organização", async () => {
    const id = await rascunho();
    const conn = await pool.connect();
    try {
      for (const [user, quantidade] of [[usuarioA, 1], [usuarioB, 0]] as const) {
        await conn.query("begin");
        await conn.query("set local role authenticated");
        await conn.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user })]);
        const { rows } = await conn.query("select id from ai_agent_versions where id=$1", [id]);
        expect(rows).toHaveLength(quantidade);
        await conn.query("rollback");
      }
    } finally { await conn.query("rollback"); conn.release(); }
  });
});
