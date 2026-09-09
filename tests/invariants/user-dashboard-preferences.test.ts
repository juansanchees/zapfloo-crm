import { execFileSync } from "node:child_process";
import { beforeAll, describe, expect, it } from "vitest";

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode via pnpm test:db");
}
const containerName: string = container;

function sql(script: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-f", "-"],
    { input: script, encoding: "utf8" },
  ).trim();
}

function asUser(userId: string, statement: string): string {
  return sql(`
    set role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);
    ${statement}
  `)
    .split("\n")
    .at(-1) ?? "";
}

const ORG_A = "da500000-0000-4000-8000-000000000001";
const ORG_B = "da500000-0000-4000-8000-000000000002";
const USER_A = "da500000-1111-4000-8000-000000000001";
const USER_B = "da500000-1111-4000-8000-000000000002";
const USER_C = "da500000-1111-4000-8000-000000000003";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${USER_A}', 'dashboard-a@invariant.test'),
      ('${USER_B}', 'dashboard-b@invariant.test'),
      ('${USER_C}', 'dashboard-c@invariant.test')
    on conflict (id) do nothing;
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'dashboard-invariant-a', 'Dashboard A', 'Dashboard A'),
      ('${ORG_B}', 'dashboard-invariant-b', 'Dashboard B', 'Dashboard B')
    on conflict (id) do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${USER_A}', '${ORG_A}', 'agent', now()),
      ('${USER_B}', '${ORG_A}', 'agent', now()),
      ('${USER_C}', '${ORG_B}', 'agent', now())
    on conflict do nothing;
    insert into public.user_dashboard_preferences (organization_id, user_id, layout)
      values ('${ORG_A}', '${USER_A}', '{"schema_version":1,"widgets":[]}'::jsonb)
    on conflict (organization_id, user_id) do update set layout=excluded.layout;
  `);
});

describe("user_dashboard_preferences RLS", () => {
  it("a pessoa lê a própria preferência", () => {
    expect(Number(asUser(USER_A, `select count(*) from public.user_dashboard_preferences;`))).toBe(1);
  });

  it("outra pessoa da mesma organização não lê a preferência", () => {
    expect(Number(asUser(USER_B, `select count(*) from public.user_dashboard_preferences;`))).toBe(0);
  });

  it("pessoa de outra organização não lê a preferência", () => {
    expect(Number(asUser(USER_C, `select count(*) from public.user_dashboard_preferences;`))).toBe(0);
  });

  it("a pessoa pode atualizar e remover somente a própria linha", () => {
    expect(
      Number(
        asUser(
          USER_A,
          `with changed as (
             update public.user_dashboard_preferences set schema_version=1 returning 1
           ) select count(*) from changed;`,
        ),
      ),
    ).toBe(1);
    expect(
      Number(
        asUser(
          USER_B,
          `with changed as (
             update public.user_dashboard_preferences set schema_version=2 returning 1
           ) select count(*) from changed;`,
        ) || 0,
      ),
    ).toBe(0);

    expect(
      Number(
        asUser(
          USER_B,
          `with removed as (
             delete from public.user_dashboard_preferences returning 1
           ) select count(*) from removed;`,
        ) || 0,
      ),
    ).toBe(0);
    expect(Number(asUser(USER_A, `select count(*) from public.user_dashboard_preferences;`))).toBe(1);
  });
});
