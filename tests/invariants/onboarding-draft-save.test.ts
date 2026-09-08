import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";

if (!process.env.TEST_DB_CONTAINER) throw new Error("Execute via pnpm test:db.");
const db = new pg.Pool({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? "54329"}/postgres`, max: 3 });
afterAll(async () => { await db.end(); });
const config = (name = "Atendente QA") => ({ name, prompt_template: "support_minimal", regras_da_casa: "Sem prometer descontos." });
async function fixture(role = "admin") {
  const org = randomUUID(); const user = randomUUID();
  await db.query("insert into auth.users(id,email) values($1,$2)", [user, `${user}@example.test`]);
  await db.query("insert into organizations(id,slug,legal_name,display_name) values($1,$2,'QA','QA')", [org, org]);
  await db.query("insert into user_organizations(user_id,organization_id,role,accepted_at) values($1,$2,$3,now())", [user, org, role]);
  return { org, user };
}
async function save(org: string, user: string, revision: number, configuration = config()) {
  const { rows } = await db.query("select public.fn_save_onboarding_draft($1,$2,$3,$4::jsonb) as result", [org, user, revision, JSON.stringify(configuration)]);
  return rows[0].result;
}
async function read(org: string) {
  return (await db.query("select revision,configuration from onboarding_drafts where organization_id=$1", [org])).rows[0];
}
describe("rascunho do onboarding: persistência sem ativação", () => {
  it("salva sem criar agente, versão ou canal e sem concluir onboarding", async () => {
    const { org, user } = await fixture();
    expect(await save(org, user, 0)).toEqual({ revision: 1, configuration: config() });
    expect(await read(org)).toEqual({ revision: 1, configuration: config() });
    for (const table of ["ai_agents", "ai_agent_versions", "channel_sessions"]) {
      expect((await db.query(`select count(*)::int as n from ${table} where organization_id=$1`, [org])).rows[0].n).toBe(0);
    }
    expect((await db.query("select onboarded_at,onboarding_state from organizations where id=$1", [org])).rows[0])
      .toEqual({ onboarded_at: null, onboarding_state: {} });
    const audits = (await db.query("select metadata from api_audit_log where organization_id=$1 and action='onboarding.draft_saved'", [org])).rows;
    expect(audits).toEqual([{ metadata: { revision: 1 } }]);
  });
  it("repetir a mesma gravação não incrementa revisão nem duplica auditoria", async () => {
    const { org, user } = await fixture();
    await save(org, user, 0);
    expect(await save(org, user, 0)).toEqual({ revision: 1, configuration: config() });
    expect((await db.query("select count(*)::int as n from api_audit_log where organization_id=$1 and action='onboarding.draft_saved'", [org])).rows[0].n).toBe(1);
  });
  it("duas abas não sobrescrevem a revisão uma da outra", async () => {
    const { org, user } = await fixture();
    await save(org, user, 0);
    const results = await Promise.allSettled([save(org, user, 1, config("Nome A")), save(org, user, 1, config("Nome B"))]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(r => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason.message).toBe("draft_conflict");
    const current = await read(org);
    expect(current.revision).toBe(2);
    expect(["Nome A", "Nome B"]).toContain(current.configuration.name);
    await expect(save(org, user, 1, config("Aba antiga"))).rejects.toThrow("draft_conflict");
    expect(await read(org)).toEqual(current);
  });
  it.each(["viewer", "agent", "manager"])("%s não salva", async role => {
    const { org, user } = await fixture(role);
    await expect(save(org, user, 0)).rejects.toThrow("draft_forbidden");
    expect(await read(org)).toBeUndefined();
  });
  it("admin externo e admin revogado não salvam", async () => {
    const a = await fixture(); const b = await fixture();
    await expect(save(a.org, b.user, 0)).rejects.toThrow("draft_forbidden");
    await db.query("update user_organizations set revoked_at=now() where user_id=$1", [a.user]);
    await expect(save(a.org, a.user, 0)).rejects.toThrow("draft_forbidden");
    expect(await read(a.org)).toBeUndefined();
  });
  it.each(["concluida", "suspensa"])("organização %s não é modificada", async state => {
    const { org, user } = await fixture();
    await db.query(state === "concluida" ? "update organizations set onboarded_at=now() where id=$1" : "update organizations set status='suspended',suspended_at=now() where id=$1", [org]);
    await expect(save(org, user, 0)).rejects.toThrow("draft_unavailable");
    expect(await read(org)).toBeUndefined();
  });
  it("input inválido e revisão futura não alteram o rascunho", async () => {
    const { org, user } = await fixture(); await save(org, user, 0);
    await expect(save(org, user, 1, config("x"))).rejects.toThrow("draft_invalid_input");
    await expect(save(org, user, 1, { ...config(), regras_da_casa: "x".repeat(20001) })).rejects.toThrow("draft_invalid_input");
    await expect(save(org, user, 9)).rejects.toThrow("draft_conflict");
    expect(await read(org)).toEqual({ revision: 1, configuration: config() });
  });
  it("leitura RLS é admin/tenant e escrita/RPC são exclusivas do servidor", async () => {
    const a = await fixture(); const b = await fixture(); await save(a.org, a.user, 0);
    const conn = await db.connect();
    try {
      for (const [user, want] of [[a.user, 1], [b.user, 0]] as const) {
        await conn.query("begin"); await conn.query("set local role authenticated");
        await conn.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user })]);
        expect((await conn.query("select * from onboarding_drafts where organization_id=$1", [a.org])).rows).toHaveLength(want);
        await conn.query("rollback");
      }
      await db.query("update user_organizations set role='viewer' where user_id=$1", [a.user]);
      await conn.query("begin"); await conn.query("set local role authenticated");
      await conn.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: a.user })]);
      expect((await conn.query("select * from onboarding_drafts where organization_id=$1", [a.org])).rows).toHaveLength(0);
      await conn.query("rollback");
    } finally { await conn.query("rollback"); conn.release(); }
    for (const role of ["anon", "authenticated"]) {
      const { rows } = await db.query("select has_table_privilege($1,'public.onboarding_drafts','INSERT,UPDATE,DELETE') as write, has_function_privilege($1,'public.fn_save_onboarding_draft(uuid,uuid,integer,jsonb)','EXECUTE') as execute", [role]);
      expect(rows[0]).toEqual({ write: false, execute: false });
    }
  });
});
