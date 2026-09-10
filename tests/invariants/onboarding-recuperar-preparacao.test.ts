import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";

if (!process.env.TEST_DB_CONTAINER) throw new Error("Execute via pnpm test:db.");
const db = new pg.Pool({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT}/postgres`, max: 4 });
afterAll(() => db.end());
const config = { name: "Lia QA", prompt_template: "support_minimal", regras_da_casa: "Sem descontos." };
const business = { display_name: "QA", o_que_faz: null };
const version = { system_prompt: "Atenda com cuidado.", provider: "openai", model: "qa-recovery", credential_id: null, tool_ids: [] };
async function fixture() {
  const org = randomUUID(); const user = randomUUID();
  await db.query("insert into auth.users(id,email) values($1,$2)", [user, `${user}@example.test`]);
  await db.query("insert into organizations(id,slug,legal_name,display_name) values($1,$2,'QA','QA')", [org, org]);
  await db.query("insert into user_organizations(user_id,organization_id,role,accepted_at) values($1,$2,'admin',now())", [user, org]);
  await db.query("insert into ai_models(provider,model_id,display_name,supports_tools) values('openai','qa-recovery','QA',true) on conflict do nothing");
  await db.query("select fn_save_onboarding_draft($1,$2,0,$3)", [org, user, config]);
  const f = { org, user };
  return { ...f, ...await prepare(f) };
}
async function prepare(f: { org: string; user: string }, revision = 1) {
  return (await db.query("select fn_prepare_onboarding_draft($1,$2,$3,null,$4,$5) result", [f.org, f.user, revision, business, version])).rows[0].result as { agent_id: string; version_id: string };
}
async function recover(f: { org: string; user: string }, previous: string | null, revision = 1) {
  return (await db.query("select fn_recuperar_preparacao_onboarding($1,$2,$3,$4) result", [f.org, f.user, revision, previous])).rows[0].result;
}
describe("recuperação explícita do agente preparado", () => {
  it("arquivar → recuperar → salvar outro nome → preparar permite continuar sem reativar o arquivado", async () => {
    const f = await fixture();
    await db.query("update ai_agents set archived_at=now() where id=$1", [f.agent_id]);
    expect(await recover(f, f.version_id)).toEqual({ revision: 1 });
    expect((await db.query("select prepared_agent_id,prepared_version_id,prepared_revision,prepared_request,prepared_snapshot,rehearsal from onboarding_drafts where organization_id=$1", [f.org])).rows[0])
      .toEqual({ prepared_agent_id: null, prepared_version_id: null, prepared_revision: null, prepared_request: null, prepared_snapshot: null, rehearsal: null });
    await db.query("select fn_save_onboarding_draft($1,$2,1,$3)", [f.org, f.user, { ...config, name: "Nova Lia QA" }]);
    const second = await prepare(f, 2);
    expect(second.agent_id).not.toBe(f.agent_id);
    expect((await db.query("select is_active,archived_at is not null archived from ai_agents where id=$1", [f.agent_id])).rows[0]).toEqual({ is_active: false, archived: true });
    expect((await db.query("select status,channel_session_id from ai_agent_versions where id=$1", [second.version_id])).rows[0]).toEqual({ status: "draft", channel_session_id: null });
    expect((await db.query("select count(*)::int n from api_audit_log where organization_id=$1 and action='onboarding.preparation_recovered'", [f.org])).rows[0].n).toBe(1);
  });
  it("exclusão do agente limpa a preparação órfã e permite preparar de novo", async () => {
    const f = await fixture();
    await db.query("delete from ai_agents where id=$1", [f.agent_id]);
    expect(await recover(f, null)).toEqual({ revision: 1 });
    expect((await prepare(f)).agent_id).not.toBe(f.agent_id);
  });
  it("exclusão somente da versão também tem recuperação", async () => {
    const f = await fixture();
    await db.query("delete from ai_agent_versions where id=$1", [f.version_id]);
    await recover(f, null);
    await db.query("select fn_save_onboarding_draft($1,$2,1,$3)", [f.org, f.user, { ...config, name: "Nova preparação" }]);
    expect((await prepare(f, 2)).version_id).not.toBe(f.version_id);
  });
  it("preparação íntegra ou agente ativo não é abandonado pelo mecanismo de recuperação", async () => {
    const f = await fixture();
    await expect(recover(f, f.version_id)).rejects.toThrow("draft_unavailable");
    await db.query("update ai_agents set is_active=true,archived_at=now() where id=$1", [f.agent_id]);
    await expect(recover(f, f.version_id)).rejects.toThrow("draft_unavailable");
  });
  it("ator externo, revogado, revisão antiga e ponteiro externo falham fechado", async () => {
    const a = await fixture(); const b = await fixture();
    await db.query("update ai_agents set archived_at=now() where id=$1", [a.agent_id]);
    await expect(recover({ ...a, user: b.user }, a.version_id)).rejects.toThrow("draft_forbidden");
    await expect(recover(a, a.version_id, 2)).rejects.toThrow("draft_conflict");
    await expect(recover(a, b.version_id)).rejects.toThrow("draft_conflict");
    await db.query("update onboarding_drafts set prepared_agent_id=$1 where organization_id=$2", [b.agent_id, a.org]);
    await expect(recover(a, a.version_id)).rejects.toThrow("draft_unavailable");
    await db.query("update user_organizations set revoked_at=now() where user_id=$1", [a.user]);
    await expect(recover(a, a.version_id)).rejects.toThrow("draft_forbidden");
  });
  it("RPC não é pública e service_role recupera com autorização explícita", async () => {
    const f = await fixture();
    for (const role of ["anon", "authenticated"]) {
      expect((await db.query("select has_function_privilege($1,'public.fn_recuperar_preparacao_onboarding(uuid,uuid,integer,uuid)','EXECUTE') allowed", [role])).rows[0].allowed).toBe(false);
    }
    await db.query("update ai_agents set archived_at=now() where id=$1", [f.agent_id]);
    const conn = await db.connect();
    try {
      await conn.query("begin"); await conn.query("set local role service_role");
      const result = await conn.query("select fn_recuperar_preparacao_onboarding($1,$2,1,$3) result", [f.org, f.user, f.version_id]);
      expect(result.rows[0].result).toEqual({ revision: 1 });
    } finally { await conn.query("rollback"); conn.release(); }
  });
});
