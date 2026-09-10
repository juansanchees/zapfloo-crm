import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { NextRequest } from "next/server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { AuthUser, Role } from "@/lib/auth/types";
import type * as Credenciais from "@/lib/agent-engine/edge/llm/credentials";
import type * as ModelCall from "@/lib/agent-engine/edge/llm/run-model-call";
import { subirPostgrestLocal, type PostgrestLocal } from "../db/postgrest-local";
import {
  seedGov, GOV_ORG, GOV_AGENT_A, GOV_AGENT_B, GOV_MANAGER, GOV_ADMIN,
  GOV_CONV_AGENT_B, GOV_CONV_UNASSIGNED, GOV_CONV_CLAIM, GOV_LEAD, GOV_CONTACT_2,
} from "./gov-helpers";

// Cookies/GoTrue (inclusive nomes sintéticos) e IA são substituídos; audit/rate limit ficam
// isolados. Rota, requireRole (RPC), runCopilot, tools, PostgREST e RLS são reais.
let usuario: AuthUser;
let clienteSessao: SupabaseClient;
let clienteAdmin: SupabaseClient;
let ferramenta = "crm_list_conversations";
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => clienteSessao }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => clienteAdmin }));
vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: async () => usuario,
  resolveActiveOrg: async () => ({ orgId: GOV_ORG, name: "Org de teste", role: usuario.organizations[0]!.role }),
  mfaEmDivida: async () => false,
}));
vi.mock("@/lib/audit", () => ({ audit: async () => undefined }));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/agent-engine/db/request-pool", () => ({ getRequestPool: () => pool }));
vi.mock("@/lib/agent-engine/edge/llm/credentials", async (original) => ({
  ...await original<typeof Credenciais>(),
  llmEdgeConfigFromEnv: () => ({}),
}));
vi.mock("@/lib/agent-engine/edge/llm/run-model-call", async (original) => ({
  ...await original<typeof ModelCall>(),
  runModelCall: async (_pool: unknown, _cfg: unknown, input: {
    tools: Record<string, { execute: (args: unknown, ctx: unknown) => Promise<unknown> }>;
  }) => {
    const result = await input.tools[ferramenta]!.execute(
      { limit: 50 }, { toolCallId: "consulta-de-teste", messages: [] },
    );
    return { result: { text: JSON.stringify(result) } };
  },
}));

if (!process.env.TEST_DB_CONTAINER || !process.env.TEST_DB_PORT) throw new Error("Use pnpm test:db.");
const pool = new pg.Pool({ connectionString: `postgres://postgres:postgres@127.0.0.1:${Number(process.env.TEST_DB_PORT)}/postgres` });
let rest: PostgrestLocal | undefined;
const idsDaOrg = [GOV_CONV_AGENT_B, GOV_CONV_UNASSIGNED, GOV_CONV_CLAIM].sort();
const outraOrg = randomUUID();
const outroResponsavel = randomUUID();
const conversaAlheia = randomUUID();
const tokenId = randomUUID();
const bearer = `dsk_fixture_${randomUUID()}`;

beforeAll(async () => {
  seedGov();
  // Sem atribuição para A, COM linhas reais para B: vazio não passa por falta de fixture.
  await pool.query(`update conversations set assigned_to_user_id=$1, assignee_kind='user',
    assigned_to_user_name='Atendente de teste', status='claimed',
    last_message_preview='Conteúdo restrito', last_message_at=now() where organization_id=$2`, [GOV_AGENT_B, GOV_ORG]);
  await pool.query(`update crm_leads set owner_user_id=$1, owner_kind='user', contact_id=$2,
    last_activity_at=now()-interval '7 days' where id=$3`, [GOV_AGENT_B, GOV_CONTACT_2, GOV_LEAD]);
  await pool.query(`insert into organizations(id,slug,legal_name,display_name)
    values($1::uuid,$1::text,'Outra organização de teste','Outra organização de teste')`, [outraOrg]);
  await pool.query("insert into auth.users(id,email) values($1,'outro@invariant.test')", [outroResponsavel]);
  await pool.query(`insert into user_organizations(user_id,organization_id,role,accepted_at)
    values($1,$2,'agent',now())`, [outroResponsavel, outraOrg]);
  const { rows: contatos } = await pool.query("insert into contacts(organization_id, display_name) values($1, 'Outro contato de teste') returning id", [outraOrg]);
  const { rows: canais } = await pool.query(`insert into channel_sessions(organization_id,waha_session_name,status,webhook_secret_encrypted)
    values($1::uuid,$1::text,'WORKING',decode('00','hex')) returning id`, [outraOrg]);
  await pool.query("insert into conversations(id,organization_id,contact_id,channel_session_id,status) values($1,$2,$3,$4,'open')", [conversaAlheia, outraOrg, contatos[0].id, canais[0].id]);
  await pool.query(`insert into api_tokens(id,organization_id,created_by,name,prefix,token_hash,scopes)
    values($1,$2,$3,'Integração de teste','fixture',$4,$5)`,
  [tokenId, GOV_ORG, GOV_ADMIN, createHash("sha256").update(bearer).digest(), JSON.stringify(["mcp:read", "role:agent"])]);
  rest = await subirPostgrestLocal();
  clienteAdmin = rest.cliente("service_role");
  vi.spyOn(clienteAdmin.auth.admin, "getUserById").mockImplementation(async (id) => ({
    data: { user: { id, user_metadata: { full_name: "Responsável sintético", email: "nao-expor@invariant.test" } } },
    error: null,
  }) as never);
});

afterAll(async () => {
  await rest?.encerrar();
  await pool.end();
});

function sessao(id: string, role: Role) {
  if (!rest) throw new Error("PostgREST não inicializado.");
  usuario = {
    id, email: "pessoa@invariant.test", full_name: "Pessoa de teste", avatar_url: null,
    is_platform_admin: false, idioma: "pt-BR",
    organizations: [{ organization_id: GOV_ORG, organization_name: "Org de teste", role }],
  };
  clienteSessao = rest.cliente("authenticated", id);
  vi.spyOn(clienteSessao.auth, "getUser").mockResolvedValue({ data: { user: { id } }, error: null } as never);
}

async function perguntar(nome: string): Promise<Record<string, unknown>> {
  ferramenta = nome;
  const { POST } = await import("@/app/api/v1/ai/ask/route");
  const resposta = await POST(new NextRequest("http://teste/api/v1/ai/ask", {
    method: "POST", body: JSON.stringify({ question: "Liste todos os registros com responsáveis", history: [] }),
  }));
  const body = await resposta.json();
  expect(resposta.status, JSON.stringify(body)).toBe(200);
  expect(body.data.consulted_tools).toEqual([nome]);
  return JSON.parse(body.data.answer);
}

function ids(linhas: unknown): string[] {
  expect(Array.isArray(linhas), "Não aceitar erro/undefined como lista vazia").toBe(true);
  return (linhas as { id: string }[]).map((linha) => linha.id).sort();
}

async function conversasHttp(): Promise<string[]> {
  const { GET } = await import("@/app/api/v1/conversations/route");
  const resposta = await GET(new NextRequest("http://teste/api/v1/conversations?limit=50"));
  const body = await resposta.json();
  expect(resposta.status, JSON.stringify(body)).toBe(200);
  return ids(body.data);
}

describe("copiloto respeita a sessão; integração mantém seu escopo explícito", () => {
  it("agent sem atribuições: mesmo conjunto vazio que GET /conversations, sem leads nem radar alheios", async () => {
    sessao(GOV_AGENT_A, "agent");
    const daTela = await conversasHttp();
    expect(daTela).toEqual([]);
    expect(ids((await perguntar("crm_list_conversations")).conversations)).toEqual(daTela);
    expect(ids((await perguntar("crm_list_leads")).leads)).toEqual([]);
    expect(ids((await perguntar("crm_list_at_risk_leads")).items)).toEqual([]);
  });

  it.each([
    ["agent dono", GOV_AGENT_B, "agent"],
    ["manager", GOV_MANAGER, "manager"],
    ["admin", GOV_ADMIN, "admin"],
  ] as const)("%s: controle positivo de conversas, leads e radar da própria organização", async (_nome, id, role) => {
    sessao(id, role);
    const daTela = await conversasHttp();
    expect(daTela).toEqual(idsDaOrg);
    const conversas = (await perguntar("crm_list_conversations")).conversations as Record<string, unknown>[];
    expect(ids(conversas)).toEqual(daTela);
    expect(conversas.every((c) => c.assigned_to_user_name === "Responsável sintético")).toBe(true);
    const leads = (await perguntar("crm_list_leads")).leads as Record<string, unknown>[];
    expect(ids(leads)).toEqual([GOV_LEAD]);
    expect(leads[0]!.owner_user_name).toBe("Responsável sintético");
    expect(JSON.stringify([conversas, leads])).not.toContain("nao-expor@");
    expect(ids((await perguntar("crm_list_at_risk_leads")).items)).toEqual([GOV_LEAD]);
    expect(daTela).not.toContain(conversaAlheia);
  });

  it("o default permite fila sem dono, mas não conversa de outro atendente", async () => {
    await pool.query(`update conversations set assigned_to_user_id=null, assignee_kind=null,
      assigned_to_user_name=null, status='open' where id=$1`, [GOV_CONV_UNASSIGNED]);
    try {
      sessao(GOV_AGENT_A, "agent");
      expect(await conversasHttp()).toEqual([GOV_CONV_UNASSIGNED]);
      expect(ids((await perguntar("crm_list_conversations")).conversations)).toEqual([GOV_CONV_UNASSIGNED]);
    } finally {
      await pool.query(`update conversations set assigned_to_user_id=$1, assignee_kind='user',
        assigned_to_user_name='Atendente de teste', status='claimed' where id=$2`, [GOV_AGENT_B, GOV_CONV_UNASSIGNED]);
    }
  });

  it("lookup de nome recusa membro revogado ou de outra organização antes de consultar Auth", async () => {
    const { resolveUserNames } = await import("@/lib/mcp/tools/_users");
    sessao(GOV_MANAGER, "manager");
    await pool.query("update user_organizations set revoked_at=now() where user_id=$1 and organization_id=$2", [GOV_AGENT_B, GOV_ORG]);
    vi.mocked(clienteAdmin.auth.admin.getUserById).mockClear();
    try {
      const nomes = await resolveUserNames({
        organizationId: GOV_ORG, requestId: randomUUID(), role: "manager",
        actor: { type: "user", id: GOV_MANAGER }, apiTokenId: "", supabase: clienteSessao,
      }, [GOV_AGENT_B, outroResponsavel]);
      expect([...nomes]).toEqual([]);
      expect(clienteAdmin.auth.admin.getUserById).not.toHaveBeenCalled();
    } finally {
      await pool.query("update user_organizations set revoked_at=null where user_id=$1 and organization_id=$2", [GOV_AGENT_B, GOV_ORG]);
    }
  });

  it("api_token validado ainda consulta toda a org pelo servidor MCP real, nunca outra org", async () => {
    const { validateBearerToken } = await import("@/lib/mcp/auth");
    const { createMcpServer } = await import("@/lib/mcp/server");
    const auth = await validateBearerToken(`Bearer ${bearer}`);
    expect(auth.apiTokenId).toBe(tokenId);
    const server = createMcpServer(auth, randomUUID());
    const client = new Client({ name: "teste-visibilidade", version: "1" });
    const [ladoCliente, ladoServidor] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(ladoServidor);
      await client.connect(ladoCliente);
      for (const [nome, campo, esperado] of [
        ["crm_list_conversations", "conversations", idsDaOrg],
        ["crm_list_leads", "leads", [GOV_LEAD]],
        ["crm_list_at_risk_leads", "items", [GOV_LEAD]],
      ] as const) {
        const resultado = await client.callTool({ name: nome, arguments: { limit: 50 } });
        expect(resultado.isError, JSON.stringify(resultado.content)).not.toBe(true);
        const linhas = (resultado.structuredContent as Record<string, unknown>)[campo] as Record<string, unknown>[];
        expect(ids(linhas)).toEqual(esperado);
        if (nome === "crm_list_conversations") expect(linhas.every((c) => c.assigned_to_user_name === "Responsável sintético")).toBe(true);
        if (nome === "crm_list_leads") expect(linhas[0]!.owner_user_name).toBe("Responsável sintético");
      }
    } finally {
      await client.close();
      await server.close();
    }
  });
});
