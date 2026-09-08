import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const container = process.env.TEST_DB_CONTAINER;
if (!container) throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db`");

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 2,
});

const IDS = {
  openai: "a1f10000-0000-4000-8000-000000000001",
  explicito: "a1f10000-0000-4000-8000-000000000002",
  antigo: "a1f10000-0000-4000-8000-000000000003",
};

beforeAll(async () => {
  await pool.query("delete from organizations where id = any($1::uuid[])", [Object.values(IDS)]);
});

afterAll(async () => {
  await pool.query("delete from organizations where id = any($1::uuid[])", [Object.values(IDS)]);
  await pool.end();
});

describe("organização nova herda a IA escolhida na instalação", () => {
  it("provider explícito recebe o modelo padrão do MESMO provider", async () => {
    const { rows } = await pool.query<{ settings: { llm: { provider: string; default_model: string } } }>(
      `insert into organizations (id, slug, legal_name, display_name, settings)
       values ($1, 'inv-provider-openai', 'Provider OpenAI', 'Provider OpenAI',
               '{"llm":{"provider":"openai"}}'::jsonb)
       returning settings`,
      [IDS.openai],
    );
    const { rows: defaults } = await pool.query<{ model_id: string }>(
      `select model_id from ai_models
       where provider = 'openai' and is_default_for_provider and deprecated_at is null`,
    );
    expect(defaults).toHaveLength(1);
    expect(rows[0]!.settings.llm).toEqual({
      provider: "openai",
      default_model: defaults[0]!.model_id,
    });
  });

  it("modelo escolhido explicitamente nunca é sobrescrito", async () => {
    const { rows } = await pool.query<{ settings: { llm: { provider: string; default_model: string } } }>(
      `insert into organizations (id, slug, legal_name, display_name, settings)
       values ($1, 'inv-provider-explicito', 'Provider explícito', 'Provider explícito',
               '{"llm":{"provider":"openai","default_model":"modelo-escolhido"}}'::jsonb)
       returning settings`,
      [IDS.explicito],
    );
    expect(rows[0]!.settings.llm).toEqual({
      provider: "openai",
      default_model: "modelo-escolhido",
    });
  });

  it("insert antigo, sem settings, continua nascendo com Anthropic", async () => {
    const { rows } = await pool.query<{ settings: { llm: { provider: string; default_model: string } } }>(
      `insert into organizations (id, slug, legal_name, display_name)
       values ($1, 'inv-provider-antigo', 'Provider antigo', 'Provider antigo')
       returning settings`,
      [IDS.antigo],
    );
    expect(rows[0]!.settings.llm.provider).toBe("anthropic");
    expect(rows[0]!.settings.llm.default_model).toBeTruthy();
  });

  it("a função de trigger não fica exposta como RPC para anon/authenticated", async () => {
    const { rows } = await pool.query<{ anon: boolean; authenticated: boolean; service_role: boolean }>(
      `select
         has_function_privilege('anon', 'public.fn_seed_org_llm_defaults()', 'execute') as anon,
         has_function_privilege('authenticated', 'public.fn_seed_org_llm_defaults()', 'execute') as authenticated,
         has_function_privilege('service_role', 'public.fn_seed_org_llm_defaults()', 'execute') as service_role`,
    );
    expect(rows[0]).toEqual({ anon: false, authenticated: false, service_role: true });
  });
});
