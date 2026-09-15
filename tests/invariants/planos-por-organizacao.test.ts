import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { GOV_ADMIN, GOV_ORG, seedGov, sql } from "./gov-helpers";

const container = process.env.TEST_DB_CONTAINER;
if (!container) throw new Error("Rode por corepack pnpm test:db.");

function escritaDiretaFoiNegada(script: string): boolean {
  try {
    sql(script);
    return false;
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? "";
    return stderr.includes("permission denied") || stderr.includes("row-level security");
  }
}

beforeAll(() => seedGov());

describe("0234 — assinatura não pertence ao tenant", () => {
  it("organização nova nasce em teste com recursos contratados no Completo", () => {
    expect(
      sql(`select plan_id || ':' || status from public.organization_subscriptions where organization_id = '${GOV_ORG}'`),
    ).toBe("completo:teste");
  });

  it("admin da organização não altera o próprio plano por PostgREST/SQL", () => {
    expect(
      escritaDiretaFoiNegada(`
        set role authenticated;
        select set_config('request.jwt.claims', '{"sub":"${GOV_ADMIN}"}', false);
        update public.organization_subscriptions set plan_id = 'completo', status = 'ativo'
         where organization_id = '${GOV_ORG}';
      `),
    ).toBe(true);
  });

  it("controle positivo: backend de plataforma altera plano e situação", () => {
    sql(`
      set role service_role;
      update public.organization_subscriptions
         set plan_id = 'basico', status = 'ativo'
       where organization_id = '${GOV_ORG}';
      reset role;
    `);
    expect(
      sql(`select plan_id || ':' || status from public.organization_subscriptions where organization_id = '${GOV_ORG}'`),
    ).toBe("basico:ativo");
  });

  it("reaplicar o baseline não altera um plano editado", () => {
    const baseline = readFileSync(join(process.cwd(), "supabase", "baseline.sql"), "utf8");
    execFileSync(
      "docker",
      ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-f", "-"],
      { input: baseline, encoding: "utf8" },
    );
    expect(
      sql(`select plan_id || ':' || status from public.organization_subscriptions where organization_id = '${GOV_ORG}'`),
    ).toBe("basico:ativo");
  });

  it("downgrade não apaga nem desconecta canais existentes", () => {
    sql(`
      insert into public.channel_sessions
        (id, organization_id, waha_session_name, webhook_secret_encrypted, status)
      values
        ('cccccccc-2222-4000-8000-000000000011', '${GOV_ORG}', 'plano-2', '\\x00'::bytea, 'WORKING'),
        ('cccccccc-2222-4000-8000-000000000012', '${GOV_ORG}', 'plano-3', '\\x00'::bytea, 'WORKING')
      on conflict (id) do nothing;
      update public.organization_subscriptions set plan_id = 'basico', status = 'ativo'
       where organization_id = '${GOV_ORG}';
    `);
    expect(
      Number(sql(`select count(*) from public.channel_sessions where organization_id = '${GOV_ORG}' and archived_at is null`)),
    ).toBe(3);
  });
});
