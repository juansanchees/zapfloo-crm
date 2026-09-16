import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ORIGEM_SITE } from "@/lib/catalogo/tipos";
import { lerEstadoDoSite } from "@/lib/onboarding/site/estado";
import type { LeituraDoSite } from "@/lib/onboarding/site/leitura";
import {
  enfileirarSiteDoNegocio,
  enfileirarSiteDoAcervo,
  lerContextoDoSite,
  lerPendenciasDoSite,
  processarSiteDaOrganizacao,
  processarFonteDoSite,
  recuperarLeiturasDoSite,
  reenfileirarSite,
} from "@/lib/onboarding/site/servico";
import { subirPostgrestLocal, type PostgrestLocal } from "../db/postgrest-local";

/**
 * A fila e a persistência são reais: SDK → PostgREST → baseline do self-host.
 * Só a leitura de rede é substituída (SSRF, teto e preços têm provas próprias
 * em leitura.test.ts/extracao.test.ts). Não basta mockar uma cadeia .eq(): a
 * concorrência precisa disputar a MESMA linha e as contagens vêm do Postgres.
 */
let clienteAdmin: SupabaseClient;
const lerSite = vi.hoisted(() => vi.fn<(...args: [string]) => Promise<LeituraDoSite>>());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => clienteAdmin }));
vi.mock("@/lib/onboarding/site/leitura", () => ({ lerSite }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

if (!process.env.TEST_DB_CONTAINER || !process.env.TEST_DB_PORT) throw new Error("Use corepack pnpm test:db.");
const pool = new pg.Pool({ connectionString: `postgres://postgres:postgres@127.0.0.1:${Number(process.env.TEST_DB_PORT)}/postgres`, max: 4 });
const ORG_A = randomUUID();
const ORG_B = randomUUID();
const SITE_A = "https://clinica-a.example/";
const SITE_B = "https://clinica-b.example/";
let rest: PostgrestLocal | undefined;

function estadoInicial(url: string) {
  return {
    welcome: {
      accepted_at: "2026-09-12T12:00:00.000Z", timezone: "America/Sao_Paulo",
      display_name: "Clínica de teste", o_que_faz: "Consultas e acompanhamento",
      site_do_negocio: url, site_leitura_pendente: true,
    },
    whatsapp: { status: "pending", skipped: true },
  };
}

function leituraValida(): LeituraDoSite {
  return {
    status: "success", resumo: "A clínica atende consultas e acompanhamento.",
    paginasLidas: 2, limiteAtingido: false,
    produtos: [{ codigo: "site-consulta", nome: "Consulta inicial", preco_cents: 12000, moeda: "BRL", descricao: "Consulta com a equipe", url: `${SITE_A}produtos` }],
    perguntas: [{ pergunta: "Preciso agendar?", resposta: "Sim, fale com a recepção.", url: `${SITE_A}duvidas` }],
    recusas: [{ url: `${SITE_A}produtos`, linha: 9, motivo: "site_preco_ambiguo" }],
  };
}

function leituraFalhou(): LeituraDoSite {
  return { status: "failed", resumo: "", paginasLidas: 0, limiteAtingido: false, produtos: [], perguntas: [], recusas: [], motivo: "site_tempo_limite" };
}

async function fonteDaOrg(orgId = ORG_A) {
  const { rows } = await pool.query("select * from ai_knowledge_sources where organization_id=$1 and source_type='site'", [orgId]);
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

async function contagens(orgId = ORG_A) {
  const { rows } = await pool.query(`select
    (select count(*)::int from catalog_products where organization_id=$1) as produtos,
    (select count(*)::int from ai_faq_items where organization_id=$1) as perguntas,
    (select count(*)::int from ai_knowledge_sources where organization_id=$1 and source_type='site') as fontes`, [orgId]);
  return rows[0]!;
}

beforeAll(async () => {
  for (const orgId of [ORG_A, ORG_B]) {
    await pool.query("insert into organizations(id,slug,legal_name,display_name,status) values($1::uuid,$1::text,'Clínica de teste','Clínica de teste','active')", [orgId]);
  }
  rest = await subirPostgrestLocal();
  clienteAdmin = rest.cliente("service_role");
}, 45_000);

beforeEach(async () => {
  lerSite.mockReset().mockResolvedValue(leituraValida());
  await pool.query("delete from ai_knowledge_sources where organization_id=any($1::uuid[])", [[ORG_A, ORG_B]]);
  await pool.query("delete from catalog_products where organization_id=any($1::uuid[])", [[ORG_A, ORG_B]]);
  for (const [id, url] of [[ORG_A, SITE_A], [ORG_B, SITE_B]] as const) {
    const estado = estadoInicial(url);
    // Só A tem trabalho pendente por padrão. B é o controle de isolamento.
    if (id === ORG_B) estado.welcome.site_leitura_pendente = false;
    await pool.query("update organizations set status='active',suspended_at=null,redacted_at=null,onboarding_state=$2::jsonb where id=$1", [id, JSON.stringify(estado)]);
  }
});

afterAll(async () => {
  await rest?.encerrar();
  await pool.query("delete from organizations where id=any($1::uuid[])", [[ORG_A, ORG_B]]);
  await pool.end();
});

describe("a leitura do site persiste sem publicar nem prender o onboarding", () => {
  it("enfileira uma fonte inativa idempotente e não espera a leitura de rede", async () => {
    const [primeira, segunda] = await Promise.all([
      enfileirarSiteDoNegocio(ORG_A, SITE_A), enfileirarSiteDoNegocio(ORG_A, SITE_A),
    ]);
    expect(primeira).toBeTruthy();
    expect(segunda).toBe(primeira);
    expect(lerSite).not.toHaveBeenCalled();
    expect(await fonteDaOrg()).toMatchObject({ id: primeira, status: "building", is_active: false, last_index_status: null });
    expect(await contagens()).toEqual({ produtos: 0, perguntas: 0, fontes: 1 });
  });

  it("o acervo enfileira qualquer endereço seguro e o mesmo cron o processa", async () => {
    const url = `${SITE_A}servicos`;
    const fonteId = await enfileirarSiteDoAcervo(ORG_A, url);
    expect(fonteId).toBeTruthy();
    expect(lerSite).not.toHaveBeenCalled();
    await processarFonteDoSite(ORG_A, fonteId!);
    expect(lerSite).toHaveBeenCalledExactlyOnceWith(url);
    expect(await fonteDaOrg()).toMatchObject({ id: fonteId, status: "ready", is_active: false });
  });

  it("grava produto e FAQ como conferência pendente, preserva o estado e não escreve no vizinho", async () => {
    await processarSiteDaOrganizacao(ORG_A);
    expect(lerSite).toHaveBeenCalledExactlyOnceWith(SITE_A);
    const fonte = await fonteDaOrg();
    expect(fonte).toMatchObject({ source_type: "site", status: "ready", is_active: false, last_index_status: "success", chunks_count: 0 });
    expect(lerEstadoDoSite(fonte.source_metadata)).toMatchObject({ resumo: leituraValida().resumo, paginasLidas: 2, limiteAtingido: false, recusas: leituraValida().recusas });
    const { rows: produtos } = await pool.query("select codigo,nome,preco_cents,moeda,origem,ativo,controla_estoque from catalog_products where organization_id=$1", [ORG_A]);
    expect(produtos).toHaveLength(1);
    expect(produtos[0]).toMatchObject({ codigo: "site-consulta", nome: "Consulta inicial", preco_cents: "12000", moeda: "BRL", origem: ORIGEM_SITE, ativo: false, controla_estoque: false });
    const { rows: perguntas } = await pool.query("select question,answer,knowledge_source_id from ai_faq_items where organization_id=$1", [ORG_A]);
    expect(perguntas).toEqual([{ question: "Preciso agendar?", answer: "Sim, fale com a recepção.", knowledge_source_id: fonte.id }]);
    const { rows: orgs } = await pool.query("select onboarding_state from organizations where id=$1", [ORG_A]);
    expect(orgs[0].onboarding_state).toMatchObject({ welcome: { site_do_negocio: SITE_A, site_leitura_pendente: false }, whatsapp: { status: "pending", skipped: true } });
    expect(await contagens(ORG_B)).toEqual({ produtos: 0, perguntas: 0, fontes: 0 });
    expect(await lerPendenciasDoSite(ORG_A)).toMatchObject({ produtos: 1, perguntas: 1, fonteId: fonte.id });
  });

  it("repetir o callback concluído não relê nem duplica produtos, perguntas ou fonte", async () => {
    await processarSiteDaOrganizacao(ORG_A);
    await processarSiteDaOrganizacao(ORG_A);
    await recuperarLeiturasDoSite();
    expect(lerSite).toHaveBeenCalledTimes(1);
    expect(await contagens()).toEqual({ produtos: 1, perguntas: 1, fontes: 1 });
  });

  it("trocar o caminho no mesmo domínio não prende a fila no nome único da fonte antiga", async () => {
    await processarSiteDaOrganizacao(ORG_A);
    const novoEndereco = `${SITE_A}clinica`;
    await pool.query("update organizations set onboarding_state=$2::jsonb where id=$1", [ORG_A, JSON.stringify(estadoInicial(novoEndereco))]);
    await processarSiteDaOrganizacao(ORG_A);
    expect(lerSite).toHaveBeenCalledTimes(2);
    expect(lerSite).toHaveBeenLastCalledWith(novoEndereco);
    expect(await lerContextoDoSite(ORG_A)).toEqual({ endereco: novoEndereco, resumo: leituraValida().resumo });
    const { rows } = await pool.query("select onboarding_state->'welcome'->'site_leitura_pendente' as pendente from organizations where id=$1", [ORG_A]);
    expect(rows[0].pendente).toBe(false);
  });

  it("o cron recupera a URL durável quando o processo morreu antes de executar after", async () => {
    expect(await contagens()).toEqual({ produtos: 0, perguntas: 0, fontes: 0 });
    const resultado = await recuperarLeiturasDoSite();
    expect(resultado.enfileiradas).toBe(1);
    expect(resultado.processadas).toBe(1);
    expect(lerSite).toHaveBeenCalledExactlyOnceWith(SITE_A);
    expect(await fonteDaOrg()).toMatchObject({ status: "ready", is_active: false });
  });

  it("dois callbacks e o cron disputam a mesma leitura, sem multiplicar o acesso ao site", async () => {
    await enfileirarSiteDoNegocio(ORG_A, SITE_A);
    let liberar!: (valor: LeituraDoSite) => void;
    const leituraPendente = new Promise<LeituraDoSite>((resolve) => { liberar = resolve; });
    lerSite.mockReturnValue(leituraPendente);
    // Ambos recebem o MESMO snapshot real antes de disputar o UPDATE. Sem a
    // barreira uma corrida sequencial por sorte não perceberia a retirada CAS.
    let liberarSnapshot!: () => void;
    let snapshots = 0;
    const snapshotPronto = new Promise<void>((resolve) => { liberarSnapshot = resolve; });
    const fetchOriginal = globalThis.fetch;
    const sonda = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const resposta = await fetchOriginal(input, init);
      const url = new URL(String(input));
      if (url.pathname === "/ai_knowledge_sources" && (init?.method ?? "GET") === "GET" && snapshots < 2) {
        snapshots++;
        if (snapshots === 2) liberarSnapshot();
        await snapshotPronto;
      }
      return resposta;
    });
    const primeiro = processarSiteDaOrganizacao(ORG_A);
    const segundo = processarSiteDaOrganizacao(ORG_A);
    let prazo: ReturnType<typeof setTimeout> | undefined;
    try {
      await vi.waitFor(() => expect(lerSite.mock.calls.length).toBeGreaterThan(0), { timeout: 3_000 });
      await Promise.race([
        recuperarLeiturasDoSite(),
        new Promise<never>((_, reject) => { prazo = setTimeout(() => reject(new Error("a segunda execução não respeitou a reserva da leitura")), 3_000); }),
      ]);
      expect(lerSite).toHaveBeenCalledTimes(1);
    } finally {
      if (prazo) clearTimeout(prazo);
      liberarSnapshot();
      liberar(leituraValida());
      await Promise.all([primeiro, segundo]);
      sonda.mockRestore();
    }
    expect(await contagens()).toEqual({ produtos: 1, perguntas: 1, fontes: 1 });
  });

  it("uma leitura antiga não grava produtos depois que outra execução tomou sua reserva", async () => {
    let liberar!: (valor: LeituraDoSite) => void;
    lerSite.mockReturnValue(new Promise<LeituraDoSite>((resolve) => { liberar = resolve; }));
    const lendo = processarSiteDaOrganizacao(ORG_A);
    try {
      await vi.waitFor(() => expect(lerSite).toHaveBeenCalledTimes(1), { timeout: 3_000 });
      await pool.query(`update ai_knowledge_sources set source_metadata=jsonb_set(
        jsonb_set(source_metadata,'{site,inicio}',to_jsonb('2099-01-01T00:00:00.000Z'::text)),
        '{site,tentativas}','2'::jsonb) where organization_id=$1`, [ORG_A]);
    } finally {
      liberar(leituraValida());
      await lendo;
    }
    expect(await contagens()).toEqual({ produtos: 0, perguntas: 0, fontes: 1 });
    expect(lerEstadoDoSite((await fonteDaOrg()).source_metadata)).toMatchObject({ inicio: "2099-01-01T00:00:00.000Z", tentativas: 2 });
  });

  it("a reserva de revisão humana nunca é reclamada pelo callback nem pelo cron", async () => {
    await enfileirarSiteDoNegocio(ORG_A, SITE_A);
    await pool.query("update ai_knowledge_sources set source_metadata=jsonb_set(source_metadata,'{site,revisaoToken}',to_jsonb($2::text)) where organization_id=$1", [ORG_A, randomUUID()]);
    await processarSiteDaOrganizacao(ORG_A);
    const rodada = await recuperarLeiturasDoSite();
    expect(rodada.processadas).toBe(0);
    expect(lerSite).not.toHaveBeenCalled();
    expect(await contagens()).toEqual({ produtos: 0, perguntas: 0, fontes: 1 });
  });

  it("o cron retoma uma reserva vencida sem deixar a fonte presa em indexando", async () => {
    const fonteId = await enfileirarSiteDoNegocio(ORG_A, SITE_A);
    await pool.query(`update ai_knowledge_sources set last_index_status='indexando',
      source_metadata=jsonb_set(jsonb_set(source_metadata,'{site,inicio}',to_jsonb('2000-01-01T00:00:00.000Z'::text)),
        '{site,tentativas}','1'::jsonb) where id=$1`, [fonteId]);
    await recuperarLeiturasDoSite();
    expect(lerSite).toHaveBeenCalledTimes(1);
    expect(await fonteDaOrg()).toMatchObject({ id: fonteId, status: "ready", is_active: false, last_index_status: "success" });
  });

  it("retry nunca substitui o nome ou preço que a pessoa já conferiu", async () => {
    await processarSiteDaOrganizacao(ORG_A);
    const fonte = await fonteDaOrg();
    await pool.query("update catalog_products set ativo=true,nome='Preço conferido pela recepção',preco_cents=23500 where organization_id=$1 and codigo='site-consulta'", [ORG_A]);
    await pool.query("update ai_knowledge_sources set status='failed',last_index_status='failed' where id=$1", [fonte.id]);
    expect(await reenfileirarSite(ORG_A, fonte.id)).toBe(true);
    const alterada = leituraValida();
    alterada.produtos[0]!.preco_cents = 99000;
    lerSite.mockResolvedValue(alterada);
    await recuperarLeiturasDoSite();
    const { rows } = await pool.query("select ativo,nome,preco_cents from catalog_products where organization_id=$1 and codigo='site-consulta'", [ORG_A]);
    expect(rows).toEqual([{ ativo: true, nome: "Preço conferido pela recepção", preco_cents: "23500" }]);
    expect(await contagens()).toEqual({ produtos: 1, perguntas: 1, fontes: 1 });
  });

  it("falha fica visível, retry é do tenant certo e a pessoa pode tentar de novo", async () => {
    lerSite.mockResolvedValue(leituraFalhou());
    await processarSiteDaOrganizacao(ORG_A);
    const fonte = await fonteDaOrg();
    expect(fonte).toMatchObject({ status: "failed", last_index_status: "failed", is_active: false });
    expect(lerEstadoDoSite(fonte.source_metadata)?.motivo).toBe("site_tempo_limite");
    // Dois tenants podem informar o mesmo site. A diferença de URL não pode
    // mascarar a falta de organization_id ao procurar a fonte por id.
    const vizinho = estadoInicial(SITE_A);
    vizinho.welcome.site_leitura_pendente = false;
    await pool.query("update organizations set onboarding_state=$2::jsonb where id=$1", [ORG_B, JSON.stringify(vizinho)]);
    expect(await reenfileirarSite(ORG_B, fonte.id)).toBe(false);
    expect(await fonteDaOrg()).toMatchObject({ status: "failed" });
    expect(await reenfileirarSite(ORG_A, fonte.id)).toBe(true);
    expect(await reenfileirarSite(ORG_A, fonte.id)).toBe(false);
    await recuperarLeiturasDoSite();
    expect(await reenfileirarSite(ORG_A, fonte.id)).toBe(true);
    await recuperarLeiturasDoSite();
    expect(await reenfileirarSite(ORG_A, fonte.id)).toBe(true);
    expect(lerSite).toHaveBeenCalledTimes(3);
    expect(await contagens()).toEqual({ produtos: 0, perguntas: 0, fontes: 1 });
  });

  it("o funil lê só o retrato pronto: durante a leitura devolve null sem aguardar rede", async () => {
    await enfileirarSiteDoNegocio(ORG_A, SITE_A);
    expect(await lerContextoDoSite(ORG_A)).toBeNull();
    expect(lerSite).not.toHaveBeenCalled();
    await processarSiteDaOrganizacao(ORG_A);
    expect(await lerContextoDoSite(ORG_A)).toEqual({ endereco: SITE_A, resumo: leituraValida().resumo });
    expect(await lerContextoDoSite(ORG_B)).toBeNull();
    expect(await lerPendenciasDoSite(ORG_B)).toMatchObject({ produtos: 0, perguntas: 0 });
    expect(lerSite).toHaveBeenCalledTimes(1);
  });

  it("organização suspensa não ganha nova leitura mesmo com flag pendente", async () => {
    await pool.query("update organizations set suspended_at=now() where id=$1", [ORG_A]);
    await processarSiteDaOrganizacao(ORG_A);
    await recuperarLeiturasDoSite();
    expect(lerSite).not.toHaveBeenCalled();
    expect(await contagens()).toEqual({ produtos: 0, perguntas: 0, fontes: 0 });
  });
});
