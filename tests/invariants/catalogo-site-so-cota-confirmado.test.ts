import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import pg from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ORIGEM_SITE } from "@/lib/catalogo/tipos";
import { crmSearchProducts } from "@/lib/mcp/tools/comercio";
import type { McpContext } from "@/lib/mcp/types";
import type { AuthUser, Role } from "@/lib/auth/types";
import { subirPostgrestLocal, type PostgrestLocal } from "../db/postgrest-local";

/**
 * Preço do site só chega à IA depois da confirmação humana. O handler MCP, o
 * client Supabase, o PostgREST e o catálogo são reais. Retirar .eq("ativo", true)
 * de comercio.ts faz o primeiro teste reprovar antes de ativar o rascunho.
 * Cookies são substituídos; requireRole e a RLS usam a sessão real do harness.
 */
let usuario: AuthUser;
let clienteSessao: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => clienteSessao }));
vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: async () => usuario,
  resolveActiveOrg: async () => ({ orgId: ORG_A, name: "Catálogo A", role: usuario.organizations[0]!.role }),
  mfaEmDivida: async () => false,
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

if (!process.env.TEST_DB_CONTAINER || !process.env.TEST_DB_PORT) throw new Error("Use corepack pnpm test:db.");
const pool = new pg.Pool({ connectionString: `postgres://postgres:postgres@127.0.0.1:${Number(process.env.TEST_DB_PORT)}/postgres`, max: 2 });
const ORG_A = randomUUID();
const ORG_B = randomUUID();
type PapelDoCatalogo = Extract<Role, "viewer" | "agent" | "manager" | "admin">;
const usuarios: Record<PapelDoCatalogo, string> = { viewer: randomUUID(), agent: randomUUID(), manager: randomUUID(), admin: randomUUID() };
const SITE = randomUUID();
const SITE_ATIVO = randomUUID();
const MANUAL = randomUUID();
const OUTRO_TENANT = randomUUID();
const NAO_CONFERIDO = randomUUID();
const ids = [SITE, SITE_ATIVO, MANUAL, OUTRO_TENANT];
let rest: PostgrestLocal | undefined;
let clientAdmin: SupabaseClient;

beforeAll(async () => {
  for (const orgId of [ORG_A, ORG_B]) {
    await pool.query("insert into organizations(id,slug,legal_name,display_name) values($1::uuid,$1::text,'Loja de teste','Loja de teste')", [orgId]);
  }
  for (const [role, id] of Object.entries(usuarios)) {
    await pool.query("insert into auth.users(id,email) values($1,$2)", [id, `${id}@invariant.test`]);
    await pool.query("insert into user_organizations(user_id,organization_id,role,accepted_at) values($1,$2,$3,now())", [id, ORG_A, role]);
  }
  for (const [id, org, codigo, origem, ativo] of [
    [SITE, ORG_A, "SITE-RASCUNHO", ORIGEM_SITE, false],
    [SITE_ATIVO, ORG_A, "SITE-APROVADO", ORIGEM_SITE, true],
    [MANUAL, ORG_A, "MANUAL-DESATIVADO", "manual", false],
    [OUTRO_TENANT, ORG_B, "SITE-VIZINHO", ORIGEM_SITE, false],
    [NAO_CONFERIDO, ORG_A, "SITE-NOVO", ORIGEM_SITE, false],
  ] as const) {
    await pool.query(`insert into catalog_products(id,organization_id,codigo,nome,origem,ativo,preco_cents,controla_estoque)
      values($1,$2,$3,$3,$4,$5,12345,false)`, [id, org, codigo, origem, ativo]);
  }
  rest = await subirPostgrestLocal();
  clientAdmin = rest.cliente("service_role");
}, 45_000);

beforeEach(async () => {
  await pool.query("update catalog_products set ativo=(id=$1) where organization_id = any($2::uuid[])", [SITE_ATIVO, [ORG_A, ORG_B]]);
});

afterAll(async () => {
  await rest?.encerrar();
  await pool.query("delete from organizations where id = any($1::uuid[])", [[ORG_A, ORG_B]]);
  await pool.query("delete from auth.users where id = any($1::uuid[])", [Object.values(usuarios)]);
  await pool.end();
});

function ctx(): McpContext {
  return {
    organizationId: ORG_A, role: "agent", actor: { type: "ai_agent", id: randomUUID(), role: "agent" },
    apiTokenId: randomUUID(), requestId: randomUUID(), supabase: clientAdmin,
  };
}

async function buscar(termo: string): Promise<Array<{ codigo: string; preco_cents: number }>> {
  const resposta = await crmSearchProducts.handler({ termo, limite: 20, somente_disponiveis: true }, ctx());
  expect(resposta).toHaveProperty("produtos");
  const produtos = (resposta as { produtos: Array<{ codigo: string; preco_cents: number }> }).produtos;
  expect(Array.isArray(produtos)).toBe(true);
  return produtos;
}

function sessao(role: PapelDoCatalogo) {
  if (!rest) throw new Error("PostgREST não inicializado");
  const id = usuarios[role];
  usuario = {
    id, email: `${role}@invariant.test`, full_name: "Pessoa de teste", avatar_url: null,
    idioma: "pt-BR", is_platform_admin: false,
    organizations: [{ organization_id: ORG_A, organization_name: "Catálogo A", role }],
  };
  clienteSessao = rest.cliente("authenticated", id);
}

async function confirmar(productIds = ids) {
  const { POST } = await import("@/app/api/v1/products/confirmar-site/route");
  return POST(new NextRequest("http://teste/api/v1/products/confirmar-site", {
    method: "POST", body: JSON.stringify({ product_ids: productIds }),
  }));
}

describe("o preço do site só é cotado depois da conferência", () => {
  it("crm_search_products recusa o rascunho real e passa a devolver o mesmo produto depois de ativo=true", async () => {
    // Controle positivo do catálogo: uma ferramenta quebrada que só devolva [] não passa.
    expect((await buscar("SITE-APROVADO")).map((p) => p.codigo)).toContain("SITE-APROVADO");
    const antes = await buscar("SITE-RASCUNHO");
    expect(antes.map((p) => p.codigo), "a IA não pode cotar o rascunho inativo do site").not.toContain("SITE-RASCUNHO");

    await pool.query("update catalog_products set ativo=true where id=$1", [SITE]);
    const depois = await buscar("SITE-RASCUNHO");
    expect(depois.find((p) => p.codigo === "SITE-RASCUNHO")).toMatchObject({ codigo: "SITE-RASCUNHO", preco_cents: 12345 });
    expect(depois.map((p) => p.codigo)).not.toContain("SITE-VIZINHO");
  });

  it.each(["viewer", "agent"] as const)("%s não confirma nem pela API nem direto no PostgREST", async (role) => {
    sessao(role);
    expect((await confirmar()).status).toBe(403);
    await clienteSessao.from("catalog_products").update({ ativo: true }).eq("id", SITE);
    expect((await pool.query("select ativo from catalog_products where id=$1", [SITE])).rows[0].ativo).toBe(false);
  });

  it.each(["manager", "admin"] as const)("%s confirma só rascunhos do site que viu, preserva preço e repete sem duplicar efeito", async (role) => {
    sessao(role);
    const { rows: antes } = await pool.query("select * from catalog_products where id=$1", [SITE]);
    const response = await confirmar();
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ confirmados: 1 });
    const { rows: depois } = await pool.query("select * from catalog_products where id=$1", [SITE]);
    expect(depois[0]).toEqual({ ...antes[0], ativo: true, updated_at: depois[0].updated_at });
    const outros = await pool.query("select id,ativo from catalog_products where id = any($1::uuid[])", [[MANUAL, OUTRO_TENANT, NAO_CONFERIDO]]);
    expect(outros.rows).toHaveLength(3);
    expect(outros.rows.every((p) => p.ativo === false)).toBe(true);
    expect((await (await confirmar()).json()).data).toEqual({ confirmados: 0 });
  });
});
