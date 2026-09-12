import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { subirPostgrestLocal, type PostgrestLocal } from "../db/postgrest-local";

import {
  GOV_ADMIN,
  GOV_AGENT_A,
  GOV_MANAGER,
  GOV_ORG,
  GOV_SESSION,
  GOV_VIEWER,
  countAs,
  lastLine,
  seedGov,
  sql,
  writeCountAs,
} from "./gov-helpers";

/**
 * Migration 0230 — as duas superfícies técnicas pertencem à instalação.
 *
 * A API e a navegação não bastam: URL e anon key do Supabase chegam ao browser.
 * Estes pares provam negação para TODOS os papéis do tenant e passagem para o
 * administrador da plataforma e para service_role, que mantém os agentes vivos.
 */

const PLATFORM_ADMIN = "cccccccc-1111-4000-8000-000000000006";
const CREDENCIAL = "eeeeeeee-3333-4000-8000-000000000001";
const TOKEN = "eeeeeeee-4444-4000-8000-000000000001";
const AGENTE = "eeeeeeee-5555-4000-8000-000000000001";
const VERSAO = "eeeeeeee-5555-4000-8000-000000000002";
const BINDING = "eeeeeeee-5555-4000-8000-000000000003";
const PAPEIS_DO_TENANT = [GOV_VIEWER, GOV_AGENT_A, GOV_MANAGER, GOV_ADMIN] as const;
let rest: PostgrestLocal | undefined;

function seedSuperficiesTecnicas(): void {
  sql(`
    insert into auth.users (id, email)
      values ('${PLATFORM_ADMIN}', 'gov-platform-admin@invariant.test')
      on conflict do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at)
      values ('${PLATFORM_ADMIN}', '${GOV_ORG}', 'admin', now())
      on conflict (user_id, organization_id) do update set role = 'admin', accepted_at = now();
    insert into public.platform_admins (user_id, granted_by, reason, mfa_required)
      values ('${PLATFORM_ADMIN}', '${PLATFORM_ADMIN}', 'fixture 0230', false)
      on conflict (user_id) do update set revoked_at = null, mfa_required = false;
    insert into public.ai_provider_credentials
      (id, organization_id, provider, label, api_key_encrypted, api_key_iv, api_key_tag, api_key_last4)
      values ('${CREDENCIAL}', '${GOV_ORG}', 'openai', 'Chave da plataforma',
              '\\x01'::bytea, '\\x02'::bytea, '\\x03'::bytea, '4242')
      on conflict do nothing;
    update public.ai_provider_credentials
       set is_active = true, validated_at = now()
     where id = '${CREDENCIAL}';
    insert into public.api_tokens
      (id, organization_id, created_by, name, prefix, token_hash, scopes)
      values ('${TOKEN}', '${GOV_ORG}', '${PLATFORM_ADMIN}', 'Token da plataforma',
              'zpf_test', '\\x04'::bytea, '["read"]'::jsonb)
      on conflict do nothing;
    insert into public.ai_agents
      (id, organization_id, name, system_prompt, model, kind, created_by)
      values ('${AGENTE}', '${GOV_ORG}', 'Agente da prova 0230', 'Responda com cuidado.',
              'openai/gpt-5.6-luna', 'mcp_agent', '${PLATFORM_ADMIN}')
      on conflict do nothing;
    insert into public.ai_agent_versions
      (id, organization_id, agent_id, version_number, system_prompt, provider, model,
       credential_id, channel_session_id, status, created_by)
      values ('${VERSAO}', '${GOV_ORG}', '${AGENTE}', 1, 'Responda com cuidado.',
              'openai', 'gpt-5.6-luna', '${CREDENCIAL}', '${GOV_SESSION}', 'draft',
              '${PLATFORM_ADMIN}')
      on conflict do nothing;
    insert into public.ai_purpose_bindings
      (id, organization_id, purpose, provider, credential_id, model_id, base_url)
      values ('${BINDING}', '${GOV_ORG}', 'prova_0230', 'openai', '${CREDENCIAL}',
              'gpt-5.6-luna', 'https://gateway-confiavel.invalid/v1')
      on conflict do nothing;
  `);
}

function leComoAnon(select: string): string | null {
  try {
    return sql(`
      set role anon;
      select set_config('request.jwt.claims', '{}', false);
      ${select}
    `);
  } catch {
    return null;
  }
}

beforeAll(async () => {
  seedGov();
  seedSuperficiesTecnicas();
  rest = await subirPostgrestLocal();
});

afterAll(async () => {
  await rest?.encerrar();
});

async function getAnon(tabela: string): Promise<Response> {
  if (!rest) throw new Error("PostgREST de teste não inicializado.");
  // Sem Authorization: o PostgREST assume exatamente o papel `anon` cuja
  // chave pública vai para o browser. A resposta não pode ser uma lista vazia
  // verde; precisa recusar a própria consulta.
  return fetch(`${rest.url}/${tabela}?select=id`);
}

describe("0230 — credenciais de IA só para administrador da plataforma", () => {
  it.each(PAPEIS_DO_TENANT)("papel do tenant %s não lê a view segura", (userId) => {
    expect(
      countAs(
        userId,
        `select count(*) from public.ai_provider_credentials_safe where id = '${CREDENCIAL}';`,
      ),
    ).toBe(0);
  });

  it.each(PAPEIS_DO_TENANT)("papel do tenant %s não altera credencial", (userId) => {
    expect(
      writeCountAs(
        userId,
        `update public.ai_provider_credentials set label = 'TENTATIVA' where id = '${CREDENCIAL}'`,
      ),
    ).toBe(0);
  });

  it("CONTROLE POSITIVO: administrador da plataforma lê e altera", () => {
    expect(
      countAs(
        PLATFORM_ADMIN,
        `select count(*) from public.ai_provider_credentials_safe where id = '${CREDENCIAL}';`,
      ),
    ).toBe(1);
    expect(
      writeCountAs(
        PLATFORM_ADMIN,
        `update public.ai_provider_credentials set label = 'Chave validada' where id = '${CREDENCIAL}'`,
      ),
    ).toBe(1);
  });

  it("a anon key não tem privilégio nem sobre a view segura", () => {
    expect(
      leComoAnon(`select count(*) from public.ai_provider_credentials_safe;`),
    ).toBeNull();
  });

  it("PostgREST recusa a consulta anônima real à view segura", async () => {
    const resposta = await getAnon("ai_provider_credentials_safe");
    expect([401, 403]).toContain(resposta.status);
    expect(await resposta.text()).not.toContain(CREDENCIAL);
  });
});

describe("0230 — tokens de API só para administrador da plataforma", () => {
  it.each(PAPEIS_DO_TENANT)("papel do tenant %s não lista tokens", (userId) => {
    expect(countAs(userId, `select count(*) from public.api_tokens where id = '${TOKEN}';`)).toBe(
      0,
    );
  });

  it.each(PAPEIS_DO_TENANT)("papel do tenant %s não revoga token", (userId) => {
    expect(
      writeCountAs(
        userId,
        `update public.api_tokens set revoked_at = now() where id = '${TOKEN}'`,
      ),
    ).toBe(0);
  });

  it("CONTROLE POSITIVO: administrador da plataforma lê e revoga", () => {
    expect(countAs(PLATFORM_ADMIN, `select count(*) from public.api_tokens where id = '${TOKEN}';`)).toBe(
      1,
    );
    expect(
      writeCountAs(
        PLATFORM_ADMIN,
        `update public.api_tokens set revoked_at = now() where id = '${TOKEN}'`,
      ),
    ).toBe(1);
  });

  it("a anon key não tem privilégio sobre tokens", () => {
    expect(leComoAnon(`select count(*) from public.api_tokens;`)).toBeNull();
  });

  it("PostgREST recusa a consulta anônima real aos tokens", async () => {
    const resposta = await getAnon("api_tokens");
    expect([401, 403]).toContain(resposta.status);
    expect(await resposta.text()).not.toContain(TOKEN);
  });
});

describe("0230 — caminhos internos continuam operacionais", () => {
  it("service_role continua lendo as duas superfícies", () => {
    const saida = lastLine(
      sql(`
        set role service_role;
        select
          (select count(*) from public.ai_provider_credentials where id = '${CREDENCIAL}'),
          (select count(*) from public.api_tokens where id = '${TOKEN}');
      `),
    );
    expect(saida).toBe("1|1");
  });
});

describe("0230 — a FK da credencial também é exclusiva da plataforma", () => {
  it("PostgREST recusa admin do tenant tentando trocar a credencial da versão", async () => {
    if (!rest) throw new Error("PostgREST de teste não inicializado.");
    const { error } = await rest
      .cliente("authenticated", GOV_ADMIN)
      .from("ai_agent_versions")
      .update({ credential_id: null })
      .eq("id", VERSAO)
      .select("id");

    expect(error?.message).toContain("ai_provider_infrastructure_platform_only");
    expect(sql(`select credential_id from public.ai_agent_versions where id = '${VERSAO}';`)).toBe(
      CREDENCIAL,
    );
  });

  it("PostgREST recusa admin do tenant tentando trocar a credencial do binding", async () => {
    if (!rest) throw new Error("PostgREST de teste não inicializado.");
    const { error } = await rest
      .cliente("authenticated", GOV_ADMIN)
      .from("ai_purpose_bindings")
      .update({ credential_id: null })
      .eq("id", BINDING)
      .select("id");

    expect(error?.message).toContain("ai_provider_infrastructure_platform_only");
    expect(sql(`select credential_id from public.ai_purpose_bindings where id = '${BINDING}';`)).toBe(
      CREDENCIAL,
    );
  });

  it("PostgREST recusa admin do tenant apontando a chave para outro endpoint", async () => {
    if (!rest) throw new Error("PostgREST de teste não inicializado.");
    const { error } = await rest
      .cliente("authenticated", GOV_ADMIN)
      .from("ai_purpose_bindings")
      .update({ base_url: "https://captura.invalid/v1" })
      .eq("id", BINDING)
      .select("id");

    expect(error?.message).toContain("ai_provider_infrastructure_platform_only");
    expect(sql(`select base_url from public.ai_purpose_bindings where id = '${BINDING}';`)).toBe(
      "https://gateway-confiavel.invalid/v1",
    );
  });

  it("CONTROLE POSITIVO: administrador da plataforma ainda troca a referência", async () => {
    if (!rest) throw new Error("PostgREST de teste não inicializado.");
    const { error } = await rest
      .cliente("authenticated", PLATFORM_ADMIN)
      .from("ai_purpose_bindings")
      .update({ credential_id: null, base_url: null })
      .eq("id", BINDING)
      .select("id");

    expect(error).toBeNull();
    expect(sql(`select credential_id is null from public.ai_purpose_bindings where id = '${BINDING}';`)).toBe(
      "t",
    );
    sql(`update public.ai_purpose_bindings
         set credential_id = '${CREDENCIAL}', base_url = 'https://gateway-confiavel.invalid/v1'
         where id = '${BINDING}';`);
  });
});
