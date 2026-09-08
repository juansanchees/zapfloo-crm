import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";

if (!process.env.TEST_DB_CONTAINER) throw new Error("Execute via pnpm test:db.");
const db = new pg.Pool({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? "54329"}/postgres`, max: 4 });
afterAll(async () => { await db.end(); });
const config = (name = "Atendente QA") => ({ name, prompt_template: "support_minimal", regras_da_casa: "Não prometa descontos." });
const business = { display_name: "Negócio QA", o_que_faz: null };
const version = { system_prompt: "Atenda com cuidado. Não prometa descontos.", provider: "openai", model: "qa-prepare", credential_id: null, tool_ids: [] };
async function fixture(role = "admin") {
  const org = randomUUID(); const user = randomUUID();
  await db.query("insert into auth.users(id,email) values($1,$2)", [user, `${user}@example.test`]);
  await db.query("insert into organizations(id,slug,legal_name,display_name) values($1,$2,'QA','Negócio QA')", [org, org]);
  await db.query("insert into user_organizations(user_id,organization_id,role,accepted_at) values($1,$2,$3,now())", [user, org, role]);
  await db.query("insert into ai_models(provider,model_id,display_name,supports_tools) values('openai','qa-prepare','QA',true),('openai','qa-other','QA outro',true) on conflict(provider,model_id) do nothing");
  // O fixture grava diretamente para também exercitar atores que não podem salvar.
  await db.query("insert into onboarding_drafts(organization_id,revision,configuration) values($1,1,$2)", [org, config()]);
  return { org, user };
}
async function prepare(f: { org: string; user: string }, overrides: { revision?: number; previous?: string | null; business?: unknown; version?: unknown } = {}) {
  return (await db.query("select public.fn_prepare_onboarding_draft($1,$2,$3,$4,$5,$6) as result", [f.org, f.user, overrides.revision ?? 1, overrides.previous ?? null, overrides.business ?? business, overrides.version ?? version])).rows[0].result;
}

describe("preparar rascunho não publica nem autoriza atendimento", () => {
  it("materializa uma versão sem canal, preservando organização e ausência de efeitos externos", async () => {
    const f = await fixture();
    const before = (await db.query("select settings,onboarding_state,onboarded_at from organizations where id=$1", [f.org])).rows[0];
    const result = await prepare(f);
    expect(result).toEqual({ revision: 1, agent_id: expect.any(String), version_id: expect.any(String) });
    expect((await db.query("select name,is_active,is_default,published_version_id from ai_agents where id=$1", [result.agent_id])).rows[0])
      .toEqual({ name: "Atendente QA", is_active: false, is_default: false, published_version_id: null });
    expect((await db.query("select status,channel_session_id,system_prompt,provider,model,credential_id from ai_agent_versions where id=$1", [result.version_id])).rows[0])
      .toEqual({ status: "draft", channel_session_id: null, system_prompt: version.system_prompt, provider: "openai", model: "qa-prepare", credential_id: null });
    expect((await db.query("select settings,onboarding_state,onboarded_at from organizations where id=$1", [f.org])).rows[0]).toEqual(before);
    for (const table of ["channel_sessions", "ai_agent_runs", "event_log"]) {
      expect((await db.query(`select count(*)::int n from ${table} where organization_id=$1`, [f.org])).rows[0].n).toBe(0);
    }
    expect((await db.query("select metadata from api_audit_log where organization_id=$1 and action='onboarding.draft_prepared'", [f.org])).rows)
      .toEqual([{ metadata: { revision: 1, version_id: result.version_id } }]);
  });
  it("repetição concorrente idêntica retorna os mesmos IDs e um audit", async () => {
    const f = await fixture();
    const [a, b] = await Promise.all([prepare(f), prepare(f)]);
    expect(b).toEqual(a);
    expect((await db.query("select count(*)::int n from ai_agent_versions where organization_id=$1", [f.org])).rows[0].n).toBe(1);
    expect((await db.query("select count(*)::int n from api_audit_log where organization_id=$1 and action='onboarding.draft_prepared'", [f.org])).rows[0].n).toBe(1);
  });
  it("duas seleções diferentes na mesma base não sobrescrevem a vencedora", async () => {
    const f = await fixture();
    const result = await Promise.allSettled([prepare(f), prepare(f, { version: { ...version, model: "qa-other" } })]);
    expect(result.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((result.find(r => r.status === "rejected") as PromiseRejectedResult).reason.message).toBe("draft_conflict");
    expect((await db.query("select count(*)::int n from ai_agent_versions where organization_id=$1", [f.org])).rows[0].n).toBe(1);
  });
  it("revisão posterior cria outra versão e não reescreve a primeira", async () => {
    const f = await fixture(); const first = await prepare(f);
    await db.query("select fn_save_onboarding_draft($1,$2,1,$3)", [f.org, f.user, config("Novo nome")]);
    await expect(prepare(f)).rejects.toThrow("draft_conflict");
    const second = await prepare(f, { revision: 2, previous: first.version_id, version: { ...version, system_prompt: "Outro prompt de ensaio." } });
    expect(second.agent_id).toBe(first.agent_id);
    expect(second.version_id).not.toBe(first.version_id);
    expect((await db.query("select system_prompt from ai_agent_versions where id=$1", [first.version_id])).rows[0].system_prompt).toBe(version.system_prompt);
  });
  it("mudança do negócio entre leitura e gravação recusa preparação", async () => {
    const f = await fixture();
    await db.query("update organizations set display_name='Mudou' where id=$1", [f.org]);
    await expect(prepare(f)).rejects.toThrow("draft_context_changed");
  });
  it.each(["system_prompt", "tool_ids"])("edição externa de %s invalida o snapshot em vez de ser apagada", async field => {
    const f = await fixture(); const first = await prepare(f);
    await db.query(field === "system_prompt" ? "update ai_agent_versions set system_prompt='Editado no editor' where id=$1" : "update ai_agent_versions set tool_ids=ARRAY['mudou'] where id=$1", [first.version_id]);
    await expect(prepare(f, { previous: first.version_id })).rejects.toThrow("draft_conflict");
  });
  it("não reaproveita agente de outro fluxo pelo nome", async () => {
    const f = await fixture();
    await db.query("insert into ai_agents(organization_id,name,system_prompt,is_active) values($1,'Atendente QA','Existente',true)", [f.org]);
    await expect(prepare(f)).rejects.toThrow("draft_name_conflict");
    expect((await db.query("select is_active,system_prompt from ai_agents where organization_id=$1", [f.org])).rows).toEqual([{ is_active: true, system_prompt: "Existente" }]);
  });
  it("não modifica agente que foi ativado em outro caminho", async () => {
    const f = await fixture(); const first = await prepare(f);
    await db.query("update ai_agents set is_active=true where id=$1", [first.agent_id]);
    await expect(prepare(f, { previous: first.version_id })).rejects.toThrow("draft_unavailable");
  });
  it.each(["viewer", "agent", "manager"])("%s não prepara", async role => {
    await expect(prepare(await fixture(role))).rejects.toThrow("draft_forbidden");
  });
  it("admin externo/revogado e organização concluída/suspensa são recusados", async () => {
    const a = await fixture(); const b = await fixture();
    await expect(prepare({ ...a, user: b.user })).rejects.toThrow("draft_forbidden");
    await db.query("update user_organizations set revoked_at=now() where user_id=$1", [a.user]);
    await expect(prepare(a)).rejects.toThrow("draft_forbidden");
    await db.query("update organizations set onboarded_at=now() where id=$1", [b.org]);
    await expect(prepare(b)).rejects.toThrow("draft_unavailable");
    const c = await fixture();
    await db.query("update organizations set status='suspended',suspended_at=now() where id=$1", [c.org]);
    await expect(prepare(c)).rejects.toThrow("draft_unavailable");
  });
  it("modelo ausente/incompatível e credencial inexistente não criam versão", async () => {
    const f = await fixture();
    await expect(prepare(f, { version: { ...version, model: "nao-existe" } })).rejects.toThrow("draft_model_unavailable");
    await expect(prepare(f, { version: { ...version, credential_id: randomUUID() } })).rejects.toThrow("draft_credential_unavailable");
    await db.query("update ai_models set deprecated_at=now() where provider='openai' and model_id='qa-prepare'");
    await expect(prepare(f)).rejects.toThrow("draft_model_unavailable");
    await db.query("update ai_models set deprecated_at=null where provider='openai' and model_id='qa-prepare'");
    expect((await db.query("select count(*)::int n from ai_agents where organization_id=$1", [f.org])).rows[0].n).toBe(0);
  });
  it("RLS mantém snapshot no tenant e RPC é exclusiva do servidor", async () => {
    const a = await fixture(); const b = await fixture(); const prepared = await prepare(a);
    const conn = await db.connect();
    try {
      for (const [user, count] of [[a.user, 1], [b.user, 0]] as const) {
        await conn.query("begin"); await conn.query("set local role authenticated");
        await conn.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user })]);
        const rows = (await conn.query("select prepared_version_id,prepared_snapshot from onboarding_drafts where organization_id=$1", [a.org])).rows;
        expect(rows).toHaveLength(count);
        if (count) expect(rows[0].prepared_version_id).toBe(prepared.version_id);
        await conn.query("rollback");
      }
    } finally { await conn.query("rollback"); conn.release(); }
    for (const role of ["anon", "authenticated"]) {
      expect((await db.query("select has_function_privilege($1,'public.fn_prepare_onboarding_draft(uuid,uuid,integer,uuid,jsonb,jsonb)','EXECUTE') allowed", [role])).rows[0].allowed).toBe(false);
    }
  });
  it("credencial deve pertencer à organização/provedor e estar validada e ativa", async () => {
    const a = await fixture(); const b = await fixture(); const credential = randomUUID();
    // Material criptográfico fictício; preparação nunca tenta decifrar ou chamar IA.
    await db.query("insert into ai_provider_credentials(id,organization_id,provider,label,api_key_encrypted,api_key_iv,api_key_tag,api_key_last4,validated_at) values($1,$2,'openai','QA','sintetico','iv','tag','0000',now())", [credential, b.org]);
    await expect(prepare(a, { version: { ...version, credential_id: credential } })).rejects.toThrow("draft_credential_unavailable");
    await db.query("update ai_provider_credentials set organization_id=$1,validated_at=null where id=$2", [a.org, credential]);
    await expect(prepare(a, { version: { ...version, credential_id: credential } })).rejects.toThrow("draft_credential_unavailable");
    await db.query("update ai_provider_credentials set validated_at=now(),is_active=false where id=$1", [credential]);
    await expect(prepare(a, { version: { ...version, credential_id: credential } })).rejects.toThrow("draft_credential_unavailable");
    await db.query("update ai_provider_credentials set is_active=true,provider='anthropic' where id=$1", [credential]);
    await expect(prepare(a, { version: { ...version, credential_id: credential } })).rejects.toThrow("draft_credential_unavailable");
    await db.query("update ai_provider_credentials set provider='openai' where id=$1", [credential]);
    const ready = await prepare(a, { version: { ...version, credential_id: credential } });
    expect((await db.query("select credential_id from ai_agent_versions where id=$1", [ready.version_id])).rows[0].credential_id).toBe(credential);
  });
  it("service_role executa a transação com seus privilégios reais", async () => {
    const f = await fixture(); const conn = await db.connect();
    try {
      await conn.query("begin"); await conn.query("set local role service_role");
      const result = (await conn.query("select fn_prepare_onboarding_draft($1,$2,1,null,$3,$4) result", [f.org, f.user, business, version])).rows[0].result;
      expect(result.revision).toBe(1);
      expect((await conn.query("select is_active from ai_agents where id=$1 and organization_id=$2", [result.agent_id, f.org])).rows[0].is_active).toBe(false);
    } finally { await conn.query("rollback"); conn.release(); }
  });
  it("modelo sem ferramentas não aceita versão com capacidades", async () => {
    const f = await fixture();
    await db.query("update ai_models set supports_tools=false where provider='openai' and model_id='qa-other'");
    await expect(prepare(f, { version: { ...version, model: "qa-other", tool_ids: ["crm_get_contact"] } })).rejects.toThrow("draft_model_unavailable");
    await db.query("update ai_models set supports_tools=true where provider='openai' and model_id='qa-other'");
    expect((await db.query("select count(*)::int n from ai_agents where organization_id=$1", [f.org])).rows[0].n).toBe(0);
  });
  it("ponteiro forjado para agente externo falha fechado", async () => {
    const a = await fixture(); const b = await fixture(); const prepared = await prepare(b);
    await db.query("update onboarding_drafts set prepared_agent_id=$1,prepared_version_id=$2 where organization_id=$3", [prepared.agent_id, prepared.version_id, a.org]);
    await expect(prepare(a)).rejects.toThrow("draft_unavailable");
    expect((await db.query("select count(*)::int n from ai_agent_versions where organization_id=$1", [a.org])).rows[0].n).toBe(0);
  });
  it.each([{ system_prompt: "curto" }, { tool_ids: [1] }, { credential_id: "invalido" }, { model: "" }, { extra: true }])("payload inválido não deixa agente órfão: %j", async invalid => {
    const f = await fixture();
    await expect(prepare(f, { version: { ...version, ...invalid } })).rejects.toThrow("draft_invalid_input");
    expect((await db.query("select count(*)::int n from ai_agents where organization_id=$1", [f.org])).rows[0].n).toBe(0);
  });
});
