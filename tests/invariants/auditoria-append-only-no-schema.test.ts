import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

const ORG = "dededede-0000-4000-8000-000000000001";
const AUDIT_OLD = "dededede-1000-4000-8000-000000000001";
const AUDIT_RECENT = "dededede-1000-4000-8000-000000000002";

function erroComoServiceRole(statement: string): string {
  try {
    sql(`set role service_role; ${statement};`);
  } catch (error) {
    return (error as { stderr?: string }).stderr ?? String(error);
  }
  throw new Error(`service_role executou escrita destrutiva: ${statement}`);
}

describe("api_audit_log é append-only no schema", () => {
  it("nenhum papel de aplicação tem DELETE, UPDATE ou TRUNCATE", () => {
    const out = sql(`
      select coalesce(
        string_agg(grantee || ':' || privilege_type, ', ' order by grantee, privilege_type),
        'NENHUM'
      )
        from information_schema.role_table_grants
       where table_schema = 'public'
         and table_name = 'api_audit_log'
         and privilege_type in ('DELETE', 'UPDATE', 'TRUNCATE')
         and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role');
    `);

    expect(out.trim()).toBe("NENHUM");
  });

  it("service_role é recusado em UPDATE, DELETE e TRUNCATE reais", () => {
    for (const statement of [
      "update public.api_audit_log set action = action where false",
      "delete from public.api_audit_log where false",
      "truncate table public.api_audit_log",
    ]) {
      expect(erroComoServiceRole(statement)).toContain("permission denied for table api_audit_log");
    }
  });

  it("SELECT e INSERT continuam concedidos ao service_role", () => {
    expect(
      sql(`select has_table_privilege('service_role', 'public.api_audit_log', 'SELECT');`),
    ).toBe("t");
    expect(
      sql(`select has_table_privilege('service_role', 'public.api_audit_log', 'INSERT');`),
    ).toBe("t");
  });

  it("a retenção SECURITY DEFINER remove vencida depois dos revokes", () => {
    const out = sql(`
      insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG}', 'audit-append-only', 'Audit Append Only', 'Audit Append Only');

      insert into public.api_audit_log (id, organization_id, action, created_at)
      values
        ('${AUDIT_OLD}', '${ORG}', 'retention.old', now() - interval '2000 days'),
        ('${AUDIT_RECENT}', '${ORG}', 'retention.recent', now() - interval '10 days');

      set role service_role;
      select public.fn_expurgar_auditoria_vencida(1825, 1000);

      select count(*) from public.api_audit_log where id = '${AUDIT_OLD}';
      select count(*) from public.api_audit_log where id = '${AUDIT_RECENT}';
    `);

    expect(out.split("\n").slice(-3)).toEqual(["1", "0", "1"]);
  });

  it("o expurgo segue SECURITY DEFINER e executável apenas pelo service_role", () => {
    expect(
      sql(`
        select p.prosecdef::text
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname = 'fn_expurgar_auditoria_vencida';
      `),
    ).toBe("true");

    expect(
      sql(`
        select has_function_privilege(
          'service_role',
          'public.fn_expurgar_auditoria_vencida(int,int)',
          'EXECUTE'
        );
      `),
    ).toBe("t");
  });

  it("os três gatilhos do commit original têm search_path fixo", () => {
    const out = sql(`
      select coalesce(string_agg(p.proname, ', ' order by p.proname), 'NENHUMA')
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in (
           'fn_agent_versions_immutable',
           'fn_ai_agent_version_content_immutable',
           'fn_contato_anonimizado_limpa_campos_personalizados'
         )
         and p.proconfig is null;
    `);

    expect(out).toBe("NENHUMA");
  });
});
