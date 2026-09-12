import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { promptDoRascunho } from "@/lib/onboarding/prompt";
import type { PromptTemplate } from "@/lib/schemas/onboarding";

if (!process.env.TEST_DB_CONTAINER) throw new Error("Execute via pnpm test:db.");
const db = new pg.Pool({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? "54329"}/postgres`, max: 3 });
afterAll(async () => { await db.end(); });
const config = (name = "Atendente QA") => ({ name, prompt_template: "support_minimal", regras_da_casa: "Sem prometer descontos." });
async function fixture(role = "admin", business: { display_name: string; o_que_faz: string | null; segmento?: string } = { display_name: "QA", o_que_faz: null }) {
  const org = randomUUID(); const user = randomUUID();
  await db.query("insert into auth.users(id,email) values($1,$2)", [user, `${user}@example.test`]);
  const welcome = {
    ...(business.o_que_faz === null ? {} : { o_que_faz: business.o_que_faz }),
    ...(business.segmento ? { segmento: business.segmento } : {}),
  };
  const onboardingState = Object.keys(welcome).length === 0 ? {} : { welcome };
  await db.query("insert into organizations(id,slug,legal_name,display_name,onboarding_state) values($1,$2,'QA',$3,$4)", [org, org, business.display_name, onboardingState]);
  await db.query("insert into user_organizations(user_id,organization_id,role,accepted_at) values($1,$2,$3,now())", [user, org, role]);
  return { org, user };
}

const separadorObjetivo = "\n\nObjetivo do agente:\n";
function configuracaoNaFronteira(template: PromptTemplate, business: { display_name: string; o_que_faz: string | null; segmento?: string }, extra = 0) {
  const semObjetivo = { name: "Atendente QA", prompt_template: template, regras_da_casa: "" };
  const tamanhoFixo = promptDoRascunho(semObjetivo, business).length + separadorObjetivo.length;
  const unidades = 20000 - tamanhoFixo + extra;
  const objetivo = "🧠".repeat(Math.floor(unidades / 2)) + (unidades % 2 ? "x" : "");
  return { ...semObjetivo, objetivo };
}
async function save(org: string, user: string, revision: number, configuration = config()) {
  const { rows } = await db.query("select public.fn_save_onboarding_draft($1,$2,$3,$4::jsonb) as result", [org, user, revision, JSON.stringify(configuration)]);
  return rows[0].result;
}
async function read(org: string) {
  return (await db.query("select revision,configuration from onboarding_drafts where organization_id=$1", [org])).rows[0];
}
describe("rascunho do onboarding: persistência sem ativação", () => {
  it("SQL preserva a letra v e trata tab vertical como trim do JavaScript", async () => {
    const business = { display_name: "QA", o_que_faz: null };
    for (const objetivo of ["vvv", "\u000b"]) {
      const configuration = { name: "Atendente QA", prompt_template: "support_minimal" as const, regras_da_casa: "", objetivo };
      const expected = promptDoRascunho(configuration, business);
      const result = (await db.query("select private.fn_onboarding_draft_prompt($1,$2) as prompt", [configuration, business])).rows[0].prompt;
      expect(result).toBe(expected);
    }
  });

  it("não trata um objetivo longo composto só pela letra v como espaço", async () => {
    const business = { display_name: "QA", o_que_faz: null };
    const configuration = { name: "Atendente QA", prompt_template: "support_minimal" as const, regras_da_casa: "", objetivo: "v".repeat(20000) };
    const { org, user } = await fixture("admin", business);
    expect(() => promptDoRascunho(configuration, business)).toThrow("draft_prompt_too_long");
    await expect(save(org, user, 0, configuration)).rejects.toThrow("draft_prompt_too_long");
  });

  it.each([
    ["ecommerce_friendly", { display_name: "Loja QA", o_que_faz: null }],
    ["ecommerce_professional", { display_name: "Clínica 🚀", o_que_faz: "saúde 🧠", segmento: "clinica" }],
    ["support_minimal", { display_name: "Serviços QA", o_que_faz: "obras", segmento: "servicos" }],
  ] as const)("salvar e montar concordam no teto exato para %s, negócio, segmento e Unicode", async (template, business) => {
    const { org, user } = await fixture("admin", business);
    const noLimite = configuracaoNaFronteira(template, business);
    const acima = configuracaoNaFronteira(template, business, 1);
    expect(promptDoRascunho(noLimite, business)).toHaveLength(20000);
    expect(() => promptDoRascunho(acima, business)).toThrow("draft_prompt_too_long");

    expect((await save(org, user, 0, noLimite)).revision).toBe(1);
    await expect(save(org, user, 1, acima)).rejects.toThrow("draft_prompt_too_long");
    expect((await read(org)).configuration).toEqual(noLimite);
  });
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
