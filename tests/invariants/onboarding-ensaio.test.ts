import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { resolveOrgLlmConfig, LlmNotConfiguredError } from "@/lib/agent-engine/edge/llm/credentials";

if (!process.env.TEST_DB_CONTAINER) throw new Error("Execute via pnpm test:db.");
const db = new pg.Pool({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? "54329"}/postgres`, max: 4 });
afterAll(async () => { await db.end(); });
async function fixture() {
  const org = randomUUID(); const user = randomUUID();
  await db.query("insert into auth.users(id,email) values($1,$2)", [user, `${user}@example.test`]);
  await db.query("insert into organizations(id,slug,legal_name,display_name) values($1,$2,'Negócio QA','Negócio QA')", [org, org]);
  await db.query("insert into user_organizations(user_id,organization_id,role,accepted_at) values($1,$2,'admin',now())", [user, org]);
  await db.query("insert into ai_models(provider,model_id,display_name,supports_tools) values('openai','qa-ensaio','QA',true) on conflict(provider,model_id) do nothing");
  await db.query("select fn_save_onboarding_draft($1,$2,0,$3)", [org, user, { name: "Atendente QA", prompt_template: "support_minimal", regras_da_casa: "Sem descontos" }]);
  const prepared = (await db.query("select fn_prepare_onboarding_draft($1,$2,1,null,$3,$4) r", [org, user, { display_name: "Negócio QA", o_que_faz: null }, { system_prompt: "Atenda com cuidado, sem descontos.", provider: "openai", model: "qa-ensaio", credential_id: null, tool_ids: [] }])).rows[0].r;
  return { org, user, version: prepared.version_id as string, agent: prepared.agent_id as string };
}
type F = Awaited<ReturnType<typeof fixture>>;
async function start(f: F) { return (await db.query("select fn_iniciar_ensaio_onboarding($1,$2,1,$3,$4) r", [f.org, f.user, f.version, "Olá, como funciona?"])).rows[0].r; }
async function finish(f: F, run: string, text = "Olá! Como posso ajudar?") {
  const call = randomUUID();
  await db.query("insert into llm_calls(id,organization_id,agent_id,purpose,provider,model,status,input_tokens,output_tokens,latency_ms) values($1,$2,$3,'onboarding_rehearsal','openai','qa-ensaio','ok',10,10,1)", [call, f.org, f.agent]);
  return (await db.query("select fn_finalizar_ensaio_onboarding($1,$2,1,$3,$4,$5,$6,null) r", [f.org, f.user, f.version, run, text, call])).rows[0].r;
}
async function review(f: F, run: string) { return (await db.query("select fn_revisar_ensaio_onboarding($1,$2,1,$3,$4) r", [f.org, f.user, f.version, run])).rows[0].r; }

describe("ensaio de texto conserva snapshot e não ativa atendimento", () => {
  it("objetivo opcional persiste e alteração retira revisão; tipo arbitrário é recusado", async () => {
    const f = await fixture(); const run = await start(f); await finish(f, run.run_id); await review(f, run.run_id);
    const configuration = { name: "Atendente QA", prompt_template: "support_minimal", regras_da_casa: "Sem descontos", objetivo: "Qualificar orçamentos" };
    const saved = (await db.query("select fn_save_onboarding_draft($1,$2,1,$3) r", [f.org, f.user, configuration])).rows[0].r;
    expect(saved.configuration.objetivo).toBe("Qualificar orçamentos");
    expect((await db.query("select rehearsal from onboarding_drafts where organization_id=$1", [f.org])).rows[0].rehearsal).toBeNull();
    await expect(review(f, run.run_id)).rejects.toThrow("draft_conflict");
    await expect(db.query("select fn_save_onboarding_draft($1,$2,2,$3)", [f.org, f.user, { ...configuration, objetivo: 42 }])).rejects.toThrow("draft_invalid_input");
  });
  it("segmento do negócio entra no snapshot e mudar/remover exige novo ensaio", async () => {
    const f = await fixture(); const run = await start(f); await finish(f, run.run_id); await review(f, run.run_id);
    await db.query("update organizations set onboarding_state=jsonb_build_object('welcome',jsonb_build_object('segmento','servicos')) where id=$1", [f.org]);
    await expect(review(f, run.run_id)).rejects.toThrow("draft_context_changed");
    const prepared = (await db.query("select fn_prepare_onboarding_draft($1,$2,1,$3,$4,$5) r", [f.org, f.user, f.version, { display_name: "Negócio QA", o_que_faz: null, segmento: "servicos" }, { system_prompt: "Atenda com cuidado no segmento serviços.", provider: "openai", model: "qa-ensaio", credential_id: null, tool_ids: [] }])).rows[0].r;
    f.version = prepared.version_id;
    const next = await start(f); await finish(f, next.run_id); await review(f, next.run_id);
    await db.query("update organizations set onboarding_state='{}'::jsonb where id=$1", [f.org]);
    await expect(review(f, next.run_id)).rejects.toThrow("draft_context_changed");
  });
  it("revisão persistida é idempotente, exige chamada real registrada e não cria canal/evento", async () => {
    const f = await fixture(); const run = await start(f);
    await expect(review(f, run.run_id)).rejects.toThrow("rehearsal_not_completed");
    await finish(f, run.run_id);
    expect(await review(f, run.run_id)).toMatchObject({ status: "completed", reviewed: true });
    expect(await review(f, run.run_id)).toMatchObject({ reviewed: true });
    expect((await db.query("select count(*)::int n from api_audit_log where organization_id=$1 and action='onboarding.rehearsal_reviewed'", [f.org])).rows[0].n).toBe(1);
    expect((await db.query("select is_active,is_default,published_version_id from ai_agents where id=$1", [f.agent])).rows[0]).toEqual({ is_active: false, is_default: false, published_version_id: null });
    for (const table of ["channel_sessions", "event_log", "ai_agent_runs"]) expect((await db.query(`select count(*)::int n from ${table} where organization_id=$1`, [f.org])).rows[0].n).toBe(0);
  });
  it.each(["business", "configuration", "version", "agent"])("alterar %s durante a rede recusa conclusão e revisão", async field => {
    const f = await fixture(); const run = await start(f);
    if (field === "business") await db.query("update organizations set display_name='Mudou' where id=$1", [f.org]);
    if (field === "configuration") await db.query("select fn_save_onboarding_draft($1,$2,1,$3)", [f.org, f.user, { name: "Outro nome", prompt_template: "support_minimal", regras_da_casa: "" }]);
    if (field === "version") await db.query("update ai_agent_versions set system_prompt='Mudou o prompt' where id=$1", [f.version]);
    if (field === "agent") await db.query("update ai_agents set name='Outro' where id=$1", [f.agent]);
    await expect(finish(f, run.run_id)).rejects.toThrow(/draft_conflict|draft_context_changed/);
    await expect(review(f, run.run_id)).rejects.toThrow(/draft_conflict|draft_context_changed/);
  });
  it("alterar snapshot depois da resposta recusa revisão antiga", async () => {
    const f = await fixture(); const run = await start(f); await finish(f, run.run_id);
    await db.query("update ai_agent_versions set tool_ids=ARRAY['crm_get_contact'] where id=$1", [f.version]);
    await expect(review(f, run.run_id)).rejects.toThrow("draft_conflict");
  });
  it("controle de mutação real: remover a comparação do snapshot permite revisão antiga", async () => {
    const f = await fixture(); const run = await start(f); await finish(f, run.run_id);
    await db.query("update ai_agent_versions set tool_ids=ARRAY['crm_get_contact'] where id=$1", [f.version]);
    await expect(review(f, run.run_id)).rejects.toThrow("draft_conflict");
    const client = await db.connect();
    try {
      await client.query("begin");
      const source = (await client.query("select pg_get_functiondef('fn_validar_ensaio_onboarding(uuid,uuid,integer,uuid)'::regprocedure) source")).rows[0].source as string;
      const mutant = source.replace("or to_jsonb(version) is distinct from draft.prepared_snapshot", "");
      expect(mutant).not.toBe(source);
      await client.query(mutant);
      const accepted = (await client.query("select fn_revisar_ensaio_onboarding($1,$2,1,$3,$4) r", [f.org, f.user, f.version, run.run_id])).rows[0].r;
      expect(accepted.reviewed).toBe(true); // O mutante viola exatamente a expectativa anterior.
    } finally { await client.query("rollback"); client.release(); }
    await expect(review(f, run.run_id)).rejects.toThrow("draft_conflict");
  });
  it("resolvedor estrito filtra credencial por organização e provedor sem fallback", async () => {
    const f = await fixture(); const other = await fixture(); const credential = randomUUID();
    await db.query("insert into ai_provider_credentials(id,organization_id,provider,label,api_key_encrypted,api_key_iv,api_key_tag,api_key_last4,validated_at) values($1,$2,'anthropic','QA','sintetico','iv','tag','0000',now())", [credential, f.org]);
    for (const org of [f.org, other.org]) {
      await expect(resolveOrgLlmConfig(db, { openaiApiKey: "somente-sintetica" }, org, { provider: "openai", credentialId: credential, strictCredential: true })).rejects.toBeInstanceOf(LlmNotConfiguredError);
    }
  });
  it("resposta vazia ou chamada inventada nunca vira prova", async () => {
    const f = await fixture(); const run = await start(f);
    await expect(finish(f, run.run_id, " ")).rejects.toThrow("rehearsal_invalid_result");
    await expect(db.query("select fn_finalizar_ensaio_onboarding($1,$2,1,$3,$4,'Resposta',$5,null)", [f.org, f.user, f.version, run.run_id, randomUUID()])).rejects.toThrow("rehearsal_invalid_result");
    await expect(review(f, run.run_id)).rejects.toThrow("rehearsal_not_completed");
  });
  it.each(["outsider", "revoked", "viewer", "completed"])("%s perde acesso mesmo depois do início", async state => {
    const f = await fixture(); const run = await start(f);
    if (state === "outsider") f.user = (await fixture()).user;
    if (state === "revoked") await db.query("update user_organizations set revoked_at=now() where organization_id=$1", [f.org]);
    if (state === "viewer") await db.query("update user_organizations set role='viewer' where organization_id=$1", [f.org]);
    if (state === "completed") await db.query("update organizations set onboarded_at=now() where id=$1", [f.org]);
    await expect(finish(f, run.run_id)).rejects.toThrow(/draft_forbidden|draft_unavailable/);
    await expect(review(f, run.run_id)).rejects.toThrow(/draft_forbidden|draft_unavailable/);
  });
  it("nova execução retira revisão; conclusão tardia da anterior não a substitui", async () => {
    const f = await fixture(); const first = await start(f); await finish(f, first.run_id); await review(f, first.run_id);
    const next = await start(f); expect(next.run_id).not.toBe(first.run_id);
    await expect(finish(f, first.run_id)).rejects.toThrow("rehearsal_conflict");
    await expect(review(f, next.run_id)).rejects.toThrow("rehearsal_not_completed");
  });
  it("bloqueia duas chamadas em andamento e permite refazer execução interrompida", async () => {
    const f = await fixture(); const first = await start(f);
    await expect(start(f)).rejects.toThrow("rehearsal_busy");
    await db.query("update onboarding_drafts set rehearsal=jsonb_set(rehearsal,'{started_at}',to_jsonb(now()-interval '2 minutes')) where organization_id=$1", [f.org]);
    const next = await start(f); expect(next.run_id).not.toBe(first.run_id);
    await expect(finish(f, first.run_id)).rejects.toThrow("rehearsal_conflict");
  });
  it("RPCs não são acessíveis ao browser; service_role executa com privilégios reais", async () => {
    const f = await fixture(); const client = await db.connect();
    try {
      await client.query("begin"); await client.query("set local role service_role");
      expect((await client.query("select fn_iniciar_ensaio_onboarding($1,$2,1,$3,'Olá') r", [f.org, f.user, f.version])).rows[0].r.run_id).toEqual(expect.any(String));
    } finally { await client.query("rollback"); client.release(); }
    for (const role of ["anon", "authenticated"]) {
      const functions = (await db.query("select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname like '%ensaio_onboarding%'")).rows;
      expect(functions.length).toBeGreaterThanOrEqual(3);
      for (const fn of functions) expect((await db.query("select has_function_privilege($1,$2::oid,'EXECUTE') allowed", [role, fn.oid])).rows[0].allowed).toBe(false);
    }
  });
});
