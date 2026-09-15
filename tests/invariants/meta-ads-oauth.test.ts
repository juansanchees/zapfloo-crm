import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg, { type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { subirPostgrestLocal, type PostgrestLocal } from "../db/postgrest-local";

/**
 * Banco + PostgREST reais do test:db. Fixtures sintéticas e cifradas pela RPC
 * real; nenhum token de produção, Graph/HTTP externo ou fallback em memória.
 * Dois clientes seguram locks reais para provar as duas ordens de desconectar
 * versus concluir. Estes testes NÃO alegam consentimento no Facebook real.
 */
if (!/^deskcomm-test-db-\d+$/.test(process.env.TEST_DB_CONTAINER ?? "")) {
  throw new Error("Execute este invariante somente pelo banco descartável de pnpm test:db.");
}
const db = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT}/postgres`,
  max: 6,
});
let rest: PostgrestLocal;
const browser = createHash("sha256").update("navegador-sintetico-meta-oauth").digest("hex");
const outroBrowser = createHash("sha256").update("outro-navegador-sintetico").digest("hex");
const RPCS = [
  "fn_ad_insights_oauth_autorizar(uuid,uuid,boolean)",
  "fn_ad_insights_oauth_emitir_link(uuid,uuid)",
  "fn_ad_insights_oauth_iniciar(uuid,uuid,text,uuid)",
  "fn_ad_insights_oauth_consumir(uuid,uuid,text)",
  "fn_ad_insights_oauth_concluir(uuid,uuid,text,bytea,text,timestamp with time zone,timestamp with time zone,text,timestamp with time zone)",
  "fn_ad_insights_mutar_conexao(uuid,uuid,text,bytea,text,boolean,bytea)",
  "fn_ad_insights_oauth_expurgar(integer,integer)",
];
type Papel = "viewer" | "agent" | "manager" | "admin";
type Fixture = { org: string; user: string };
type Resultado = { status: string; id: string; expires_at: string; user_id: string; parent_link_id: string | null; origin: string };

beforeAll(async () => {
  await db.query(`insert into private.app_secrets(name,value)
    values('nuvemshop_oauth_key','chave-fixture-meta-ads-oauth-nao-e-segredo') on conflict(name) do nothing`);
  rest = await subirPostgrestLocal();
});
afterAll(async () => {
  await rest?.encerrar();
  await db.end();
});

async function fixture(role: Papel = "admin"): Promise<Fixture> {
  const org = randomUUID();
  const user = randomUUID();
  await db.query("insert into auth.users(id,email) values($1,$2)", [user, `${user}@example.test`]);
  await db.query("insert into organizations(id,slug,legal_name,display_name) values($1,$2,'Clínica QA','Clínica QA')", [org, org]);
  await db.query("insert into user_organizations(user_id,organization_id,role,accepted_at) values($1,$2,$3,now())", [user, org, role]);
  return { org, user };
}
async function rpcOn<T = Resultado>(client: PoolClient, name: string, params: unknown[]): Promise<T> {
  const placeholders = params.map((_, index) => `$${index + 1}`).join(",");
  return (await client.query(`select public.${name}(${placeholders}) result`, params)).rows[0].result;
}
async function rpc<T = Resultado>(name: string, params: unknown[]): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("begin; set local role service_role");
    const result = await rpcOn<T>(client, name, params);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally { client.release(); }
}
const emitir = (f: Fixture) => rpc("fn_ad_insights_oauth_emitir_link", [f.org, f.user]);
const iniciar = (f: Fixture, link: string | null = null, digest = browser) =>
  rpc("fn_ad_insights_oauth_iniciar", [f.org, f.user, digest, link]);
const consumir = (f: Fixture, id: string, digest = browser) =>
  rpc("fn_ad_insights_oauth_consumir", [f.org, id, digest]);
const desconectar = (f: Fixture) => rpc("fn_ad_insights_mutar_conexao", [f.org, f.user, "disconnect"]);
async function cifrar(texto = "token-sintetico-meta-oauth-exclusivo-da-fixture") {
  return (await db.query("select public.fn_encrypt_oauth($1) encrypted", [texto])).rows[0].encrypted as Buffer;
}
async function parametrosConclusao(f: Fixture, id: string, digest = browser) {
  return [f.org, id, digest, await cifrar(), null,
    "2036-01-01T00:00:00Z", "2036-02-01T00:00:00Z", "USER", new Date().toISOString()];
}
const concluir = async (f: Fixture, id: string, digest = browser) =>
  rpc("fn_ad_insights_oauth_concluir", await parametrosConclusao(f, id, digest));
async function conexao(f: Fixture) {
  return (await db.query("select * from ad_insights_connections where organization_id=$1 and platform='meta_ads'", [f.org])).rows[0];
}
async function request(id: string) {
  return (await db.query("select * from ad_insights_oauth_requests where id=$1", [id])).rows[0];
}
async function expirar(id: string, minutes: number) {
  await db.query(`update ad_insights_oauth_requests
    set created_at=now()-make_interval(mins=>$2),
        expires_at=now()-interval '1 minute' where id=$1`, [id, minutes]);
}
async function esperarBloqueio(waiter: number, blocker: number) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const { rows } = await db.query("select $2::int=any(pg_blocking_pids($1::int)) blocked", [waiter, blocker]);
    if (rows[0].blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("O segundo RPC não aguardou o lock real da organização; a prova de serialização falhou.");
}

describe("Meta OAuth — armazenamento durável e server-only", () => {
  it("migration e apêndice entregam exatamente o mesmo SQL", () => {
    const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260915210000_0235_meta_ads_oauth.sql"), "utf8").trim();
    const baseline = readFileSync(join(process.cwd(), "supabase/baseline.sql"), "utf8");
    expect(baseline).toContain(`-- ---- Conectar anúncios com OAuth e link de agência (migration 0235) ----\n${migration}\n`);
  });
  it("notifica o PostgREST depois da última função criada, não depende de bloco anterior", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260915210000_0235_meta_ads_oauth.sql"), "utf8");
    const funcoes = [...sql.matchAll(/^create or replace function /gm)];
    expect(funcoes.length).toBeGreaterThan(0);
    const notificacao = sql.lastIndexOf("\nnotify pgrst, 'reload schema';");
    expect(notificacao).toBeGreaterThan(funcoes.at(-1)?.index ?? Number.MAX_SAFE_INTEGER);
    expect(sql.trimEnd()).toMatch(/notify pgrst, 'reload schema';$/);
  });
  it("RLS ligada, zero policies, nenhum grant anon/auth e RPCs invoker", async () => {
    const table = (await db.query(`select relrowsecurity from pg_class where oid='public.ad_insights_oauth_requests'::regclass`)).rows[0];
    expect(table.relrowsecurity).toBe(true);
    expect((await db.query("select * from pg_policies where schemaname='public' and tablename='ad_insights_oauth_requests'")).rows).toEqual([]);
    for (const role of ["anon", "authenticated"]) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
        expect((await db.query("select has_table_privilege($1,'public.ad_insights_oauth_requests',$2) allowed", [role, privilege])).rows[0].allowed).toBe(false);
      }
    }
    for (const signature of RPCS) {
      const { rows } = await db.query(`select prosecdef,proconfig,
        has_function_privilege('anon',oid,'EXECUTE') anon,
        has_function_privilege('authenticated',oid,'EXECUTE') authenticated,
        has_function_privilege('service_role',oid,'EXECUTE') service
        from pg_proc where oid=$1::regprocedure`, [`public.${signature}`]);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ prosecdef: false, anon: false, authenticated: false, service: true });
      expect(rows[0].proconfig).toContain('search_path=""');
    }
  });
  it("PostgREST real recusa anon e qualquer papel autenticado, mas service_role emite", async () => {
    const f = await fixture();
    const api = rest.cliente("service_role");
    const result = await api.rpc("fn_ad_insights_oauth_emitir_link", { p_organization_id: f.org, p_user_id: f.user });
    expect(result.error).toBeNull();
    expect(result.data.status).toBe("ok");
    expect((await fetch(`${rest.url}/ad_insights_oauth_requests?select=id`)).status).toBeGreaterThanOrEqual(400);
    expect((await fetch(`${rest.url}/rpc/fn_ad_insights_oauth_emitir_link`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ p_organization_id: f.org, p_user_id: f.user }),
    })).status).toBeGreaterThanOrEqual(400);
    for (const role of ["viewer", "agent", "manager", "admin"] as const) {
      const member = await fixture(role);
      const client = rest.cliente("authenticated", member.user);
      expect((await client.from("ad_insights_oauth_requests").select("id")).error?.code).toBe("42501");
      expect((await client.rpc("fn_ad_insights_oauth_emitir_link", { p_organization_id: member.org, p_user_id: member.user })).error).not.toBeNull();
    }
  });
  it.each(["viewer", "agent", "manager", "admin"] as const)("papel %s é revalidado no banco", async (role) => {
    const f = await fixture(role);
    const result = await emitir(f);
    expect(result.status).toBe(role === "manager" || role === "admin" ? "ok" : "forbidden");
  });
  it("platform full vigente pode; support_readonly e revogado não", async () => {
    const f = await fixture("viewer");
    await db.query("insert into platform_admins(user_id,granted_by,scope,reason) values($1,$1,'support_readonly','Fixture Meta OAuth')", [f.user]);
    expect((await emitir(f)).status).toBe("forbidden");
    await db.query("update platform_admins set scope='full' where user_id=$1", [f.user]);
    expect((await emitir(f)).status).toBe("ok");
    await db.query("update platform_admins set revoked_at=now() where user_id=$1", [f.user]);
    expect((await emitir(f)).status).toBe("forbidden");
  });
  it("não aceita membro de outra organização nem pai cross-org na FK", async () => {
    const a = await fixture();
    const b = await fixture();
    const link = await emitir(a);
    expect((await iniciar(b, link.id)).status).toBe("request_unavailable");
    expect((await emitir({ org: b.org, user: a.user })).status).toBe("forbidden");
    await expect(db.query(`insert into ad_insights_oauth_requests
      (organization_id,user_id,kind,parent_link_id,browser_digest,expires_at)
      values($1,$2,'session',$3,$4,clock_timestamp()+interval '1 minute')`, [b.org, b.user, link.id, browser])).rejects.toMatchObject({ code: "23503" });
    expect((await request(link.id)).consumed_at).toBeNull();
  });
  it("mesmo administrador em dois tenants não transpõe link ou sessão entre eles", async () => {
    const a = await fixture();
    const b = await fixture();
    await db.query("insert into user_organizations(user_id,organization_id,role,accepted_at) values($1,$2,'admin',now())", [a.user, b.org]);
    const bComMesmoAtor = { org: b.org, user: a.user };
    const link = await emitir(a);
    expect((await iniciar(bComMesmoAtor, link.id)).status).toBe("request_unavailable");
    const session = await iniciar(a);
    expect((await consumir(bComMesmoAtor, session.id)).status).toBe("request_unavailable");
    await consumir(a, session.id);
    expect((await concluir(bComMesmoAtor, session.id)).status).toBe("request_unavailable");
    expect(await conexao(a)).toBeUndefined();
    expect(await conexao(b)).toBeUndefined();
  });
});

describe("Meta OAuth — prazo, replay e vínculo", () => {
  it("link 30min vira uma única sessão 10min e o callback é consumido uma vez", async () => {
    const f = await fixture();
    const link = await emitir(f);
    const original = await request(link.id);
    expect(original.expires_at.getTime() - original.created_at.getTime()).toBe(30 * 60_000);
    const session = await iniciar(f, link.id);
    expect(session.status).toBe("ok");
    const row = await request(session.id);
    expect(row.expires_at.getTime() - row.created_at.getTime()).toBe(10 * 60_000);
    expect((await iniciar(f, link.id)).status).toBe("request_unavailable");
    expect((await consumir(f, session.id))).toMatchObject({ status: "ok", user_id: f.user, parent_link_id: link.id, origin: "agency" });
    expect((await consumir(f, session.id)).status).toBe("request_unavailable");
  });
  it("recusa link após 31min, sessão após 11min e exatamente na borda de expiração", async () => {
    const f = await fixture();
    const link = await emitir(f);
    await expirar(link.id, 31);
    expect((await iniciar(f, link.id)).status).toBe("request_unavailable");
    const session = await iniciar(f);
    await expirar(session.id, 11);
    expect((await consumir(f, session.id)).status).toBe("request_unavailable");
    const edge = await iniciar(f);
    await db.query(`update ad_insights_oauth_requests set created_at=clock_timestamp()-interval '1 minute',expires_at=clock_timestamp() where id=$1`, [edge.id]);
    expect((await consumir(f, edge.id)).status).toBe("request_unavailable");
  });
  it("navegador errado não queima a sessão; a assinatura/state não substitui o vínculo", async () => {
    const f = await fixture();
    const session = await iniciar(f);
    expect((await consumir(f, session.id, outroBrowser)).status).toBe("request_unavailable");
    expect((await request(session.id)).consumed_at).toBeNull();
    expect((await consumir(f, session.id)).status).toBe("ok");
    expect((await concluir(f, session.id, outroBrowser)).status).toBe("request_unavailable");
    expect(await conexao(f)).toBeUndefined();
  });
  it("duas tentativas simultâneas não reivindicam o mesmo link nem o mesmo retorno", async () => {
    const f = await fixture();
    const link = await emitir(f);
    const claims = await Promise.all([iniciar(f, link.id), iniciar(f, link.id)]);
    expect(claims.map((r) => r.status).sort()).toEqual(["ok", "request_unavailable"]);
    const session = claims.find((r) => r.status === "ok")!;
    expect((await Promise.all([consumir(f, session.id), consumir(f, session.id)])).map((r) => r.status).sort()).toEqual(["ok", "request_unavailable"]);
  });
  it("sessão de outra organização não é consumida nem concluída", async () => {
    const a = await fixture();
    const b = await fixture();
    const session = await iniciar(a);
    expect((await consumir(b, session.id)).status).toBe("request_unavailable");
    expect((await request(session.id)).consumed_at).toBeNull();
    await consumir(a, session.id);
    expect((await concluir(b, session.id)).status).toBe("request_unavailable");
    expect(await conexao(a)).toBeUndefined();
    expect(await conexao(b)).toBeUndefined();
  });
  it("não inicia por autor revogado nem conclui se ele perdeu manager/admin depois", async () => {
    const f = await fixture("manager");
    const session = await iniciar(f);
    await consumir(f, session.id);
    const link = await emitir(f);
    await db.query("update user_organizations set role='agent' where organization_id=$1 and user_id=$2", [f.org, f.user]);
    expect((await iniciar(f, link.id)).status).toBe("forbidden");
    expect((await concluir(f, session.id)).status).toBe("forbidden");
    expect(await conexao(f)).toBeUndefined();
  });
  it("organização suspensa e convite ainda não aceito não emitem autorização", async () => {
    const f = await fixture();
    await db.query("update user_organizations set accepted_at=null where organization_id=$1 and user_id=$2", [f.org, f.user]);
    expect((await emitir(f)).status).toBe("forbidden");
    await db.query("update user_organizations set accepted_at=now() where organization_id=$1 and user_id=$2", [f.org, f.user]);
    await db.query("update organizations set status='suspended',suspended_at=now() where id=$1", [f.org]);
    expect((await emitir(f)).status).toBe("forbidden");
  });
  it("revogar o link pai também impede consumir e concluir a sessão que ele gerou", async () => {
    const f = await fixture();
    const link = await emitir(f);
    const session = await iniciar(f, link.id);
    await db.query("update ad_insights_oauth_requests set revoked_at=now() where id=$1", [link.id]);
    expect((await consumir(f, session.id)).status).toBe("request_unavailable");
    await db.query("update ad_insights_oauth_requests set revoked_at=null where id=$1", [link.id]);
    await consumir(f, session.id);
    await db.query("update ad_insights_oauth_requests set revoked_at=now() where id=$1", [link.id]);
    expect((await concluir(f, session.id)).status).toBe("request_unavailable");
  });
});

describe("Meta OAuth — gravar, desconectar e concorrer", () => {
  it("exige consumo e conclusão únicos; cifra real e validade real sobrevivem sem plaintext", async () => {
    const f = await fixture();
    const session = await iniciar(f);
    expect((await concluir(f, session.id)).status).toBe("request_unavailable");
    await consumir(f, session.id);
    expect((await concluir(f, session.id)).status).toBe("ok");
    expect((await concluir(f, session.id)).status).toBe("request_unavailable");
    const c = await conexao(f);
    expect(c.access_token_encrypted.includes(Buffer.from("token-sintetico"))).toBe(false);
    expect((await db.query("select fn_decrypt_oauth(access_token_encrypted) plaintext from ad_insights_connections where organization_id=$1", [f.org])).rows[0].plaintext).toBe("token-sintetico-meta-oauth-exclusivo-da-fixture");
    expect(c.token_expires_at.toISOString()).toBe("2036-01-01T00:00:00.000Z");
    expect(c.data_access_expires_at.toISOString()).toBe("2036-02-01T00:00:00.000Z");
    expect(c.token_type).toBe("USER");
    expect(c.token_checked_at).not.toBeNull();
    expect((await request(session.id)).completed_at).not.toBeNull();
  });
  it("conclusão após expiração não grava mesmo com sessão já consumida", async () => {
    const f = await fixture();
    const session = await iniciar(f);
    await consumir(f, session.id);
    await expirar(session.id, 11);
    expect((await concluir(f, session.id)).status).toBe("request_unavailable");
    expect(await conexao(f)).toBeUndefined();
  });
  it("desconectar revoga até quando não existe conexão, impedindo callback atrasado", async () => {
    const f = await fixture();
    const session = await iniciar(f);
    const link = await emitir(f);
    await consumir(f, session.id);
    expect((await desconectar(f)).status).toBe("ok");
    expect((await concluir(f, session.id)).status).toBe("request_unavailable");
    expect((await iniciar(f, link.id)).status).toBe("request_unavailable");
    expect(await conexao(f)).toBeUndefined();
  });
  it("novo OAuth limpa conta antiga e revoga outra autorização pendente", async () => {
    const f = await fixture();
    expect((await rpc("fn_ad_insights_mutar_conexao", [f.org, f.user, "save", await cifrar(), "act_123", true])).status).toBe("ok");
    const session = await iniciar(f);
    const outra = await iniciar(f);
    await consumir(f, session.id);
    await consumir(f, outra.id);
    await concluir(f, session.id);
    expect((await conexao(f)).default_account_id).toBeNull();
    expect((await concluir(f, outra.id)).status).toBe("request_unavailable");
  });
  it("token manual novo apaga validade anterior e invalida autorizações; conta apenas não", async () => {
    const f = await fixture();
    const session = await iniciar(f);
    await consumir(f, session.id);
    await concluir(f, session.id);
    const pendente = await iniciar(f);
    await consumir(f, pendente.id);
    const key = await cifrar("outro-token-sintetico-fixture");
    expect((await rpc("fn_ad_insights_mutar_conexao", [f.org, f.user, "save", key])).status).toBe("ok");
    expect(await conexao(f)).toMatchObject({ token_expires_at: null, data_access_expires_at: null, token_type: null, token_checked_at: null });
    expect((await concluir(f, pendente.id)).status).toBe("request_unavailable");
    const novo = await iniciar(f);
    expect((await rpc("fn_ad_insights_mutar_conexao", [f.org, f.user, "select_account", null, "act_456", false, key])).status).toBe("ok");
    expect((await request(novo.id)).revoked_at).toBeNull();
  });
  it("manager seleciona conta, mas não ganha escrita manual nem desconexão de admin", async () => {
    const f = await fixture("manager");
    const session = await iniciar(f);
    await consumir(f, session.id);
    await concluir(f, session.id);
    expect((await rpc("fn_ad_insights_mutar_conexao", [f.org, f.user, "select_account", null, "act_987", false, (await conexao(f)).access_token_encrypted])).status).toBe("ok");
    expect((await conexao(f)).default_account_id).toBe("act_987");
    expect((await desconectar(f)).status).toBe("forbidden");
    expect((await rpc("fn_ad_insights_mutar_conexao", [f.org, f.user, "save", await cifrar()])).status).toBe("forbidden");
  });
  it("seleção validada com token anterior não grava depois de reconectar", async () => {
    const f = await fixture();
    const anterior = await cifrar("credencial-sintetica-anterior");
    await rpc("fn_ad_insights_mutar_conexao", [f.org, f.user, "save", anterior]);
    const session = await iniciar(f);
    await consumir(f, session.id);
    await concluir(f, session.id);
    expect((await rpc("fn_ad_insights_mutar_conexao", [f.org, f.user, "select_account", null, "act_999", false, anterior])).status).toBe("request_unavailable");
    expect((await conexao(f)).default_account_id).toBeNull();
  });
  it("sem datas informadas preserva desconhecido, não inventa sessenta dias", async () => {
    const f = await fixture();
    const session = await iniciar(f);
    await consumir(f, session.id);
    expect((await rpc("fn_ad_insights_oauth_concluir", [f.org, session.id, browser, await cifrar()])).status).toBe("ok");
    expect(await conexao(f)).toMatchObject({ token_expires_at: null, data_access_expires_at: null, token_type: null, token_checked_at: null });
  });
  it("falha de gravação reverte completed_at; não existe recibo de conexão que falhou", async () => {
    const f = await fixture();
    const session = await iniciar(f);
    await consumir(f, session.id);
    // Defeito injetado SOMENTE no banco descartável desta prova: simula INSERT
    // recusado depois de o RPC marcar completed_at. finally restaura o schema.
    await db.query("alter table ad_insights_connections add constraint qa_recusa_oauth check(platform<>'meta_ads') not valid");
    try {
      await expect(concluir(f, session.id)).rejects.toMatchObject({ code: "23514" });
      expect((await request(session.id)).completed_at).toBeNull();
      expect(await conexao(f)).toBeUndefined();
    } finally {
      await db.query("alter table ad_insights_connections drop constraint qa_recusa_oauth");
    }
    expect((await concluir(f, session.id)).status).toBe("ok");
  });
  it.each(["disconnect_first", "complete_first"])("serialização real %s não reconecta após desconexão", async (order) => {
    const f = await fixture();
    const session = await iniciar(f);
    await consumir(f, session.id);
    const params = await parametrosConclusao(f, session.id);
    const a = await db.connect();
    const b = await db.connect();
    let pending: Promise<Resultado> | undefined;
    try {
      const aid = (await a.query("select pg_backend_pid() pid")).rows[0].pid;
      const bid = (await b.query("select pg_backend_pid() pid")).rows[0].pid;
      await a.query("begin; set local role service_role");
      await b.query("begin; set local role service_role");
      const first = order === "disconnect_first"
        ? await rpcOn(a, "fn_ad_insights_mutar_conexao", [f.org, f.user, "disconnect"])
        : await rpcOn(a, "fn_ad_insights_oauth_concluir", params);
      expect(first.status).toBe("ok");
      pending = order === "disconnect_first"
        ? rpcOn(b, "fn_ad_insights_oauth_concluir", params)
        : rpcOn(b, "fn_ad_insights_mutar_conexao", [f.org, f.user, "disconnect"]);
      await esperarBloqueio(bid, aid);
      await a.query("commit");
      expect((await pending).status).toBe(order === "disconnect_first" ? "request_unavailable" : "ok");
      await b.query("commit");
      expect(await conexao(f)).toBeUndefined();
    } finally {
      await a.query("rollback");
      if (pending) await pending.catch(() => undefined);
      await b.query("rollback");
      a.release(); b.release();
    }
  });
  it("nova sessão espera desconexão sem conexão prévia: lock é da organização, não incidental", async () => {
    const f = await fixture();
    const a = await db.connect();
    const b = await db.connect();
    let pending: Promise<Resultado> | undefined;
    try {
      const aid = (await a.query("select pg_backend_pid() pid")).rows[0].pid;
      const bid = (await b.query("select pg_backend_pid() pid")).rows[0].pid;
      await a.query("begin; set local role service_role");
      await b.query("begin; set local role service_role");
      expect((await rpcOn(a, "fn_ad_insights_mutar_conexao", [f.org, f.user, "disconnect"])).status).toBe("ok");
      pending = rpcOn(b, "fn_ad_insights_oauth_iniciar", [f.org, f.user, browser, null]);
      await esperarBloqueio(bid, aid);
      await a.query("commit");
      expect((await pending).status).toBe("ok");
      await b.query("commit");
    } finally {
      await a.query("rollback");
      if (pending) await pending.catch(() => undefined);
      await b.query("rollback");
      a.release(); b.release();
    }
  });
});

describe("Meta OAuth — expurgo limitado não destrói autorização vigente", () => {
  it("piso de um dia, limite de lote e zero quando não há vencidos", async () => {
    const f = await fixture();
    const ativo = await emitir(f);
    const vencido = await emitir(f);
    await expirar(vencido.id, 31);
    expect(await rpc<number>("fn_ad_insights_oauth_expurgar", [0, 1000])).toBe(0);
    const a = await emitir(f);
    const b = await emitir(f);
    for (const id of [a.id, b.id]) {
      await db.query("update ad_insights_oauth_requests set created_at=now()-interval '2 days',expires_at=now()-interval '2 days'+interval '30 minutes' where id=$1", [id]);
    }
    expect(await rpc<number>("fn_ad_insights_oauth_expurgar", [1, 1])).toBe(1);
    expect(await rpc<number>("fn_ad_insights_oauth_expurgar", [1, 1])).toBe(1);
    expect(await rpc<number>("fn_ad_insights_oauth_expurgar", [1, 1])).toBe(0);
    expect(await request(ativo.id)).toBeDefined();
    expect(await request(vencido.id)).toBeDefined();
  });
  it("sessão velha sai antes do pai, e cada remoção aparece na contagem", async () => {
    const f = await fixture();
    const link = await emitir(f);
    const session = await iniciar(f, link.id);
    await db.query(`update ad_insights_oauth_requests set created_at=now()-interval '2 days',
      expires_at=now()-interval '2 days'+interval '10 minutes' where id=any($1::uuid[])`, [[link.id, session.id]]);
    expect(await rpc<number>("fn_ad_insights_oauth_expurgar", [1, 1000])).toBe(1);
    expect(await request(session.id)).toBeUndefined();
    expect(await request(link.id)).toBeDefined();
    expect(await rpc<number>("fn_ad_insights_oauth_expurgar", [1, 1000])).toBe(1);
    expect(await request(link.id)).toBeUndefined();
  });
});
