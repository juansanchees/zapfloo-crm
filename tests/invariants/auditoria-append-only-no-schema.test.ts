import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * `api_audit_log` é append-only NO SCHEMA — e agora isso é medido, não afirmado.
 *
 * ## O defeito que fez este arquivo existir
 *
 * A migration 0167 afirma no cabeçalho que o baseline concede a `api_audit_log`
 * "SELECT, INSERT, REFERENCES, TRIGGER, TRUNCATE, MAINTAIN — DELETE e UPDATE
 * não estão lá para ninguém", e o `CLAUDE.md` repete a frase como garantia de
 * integridade da trilha. Medido numa instalação real em 2026-09-10, os quatro
 * papéis tinham TRUNCATE, DELETE e UPDATE.
 *
 * A causa não era deriva daquela instalação: é o próprio baseline. O
 * `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON
 * TABLES` alcança toda tabela criada depois dele, `api_audit_log` inclusive, e
 * nenhum `revoke` existia no repositório. A frase era falsa em TODA instalação.
 *
 * ## Por que catálogo e não comportamento
 *
 * `anon` e `authenticated` já eram barrados pela RLS mesmo com o grant (não há
 * policy de DELETE nem de UPDATE), então um teste de comportamento sob esses
 * papéis passaria ANTES e DEPOIS do conserto — mediria a RLS, não o grant. Quem
 * tinha poder real é `service_role`, que tem BYPASSRLS; e exercitar um DELETE
 * real como service_role para vê-lo falhar exigiria a service key dentro do
 * teste. O catálogo é a fonte exata deste invariante.
 *
 * TRUNCATE entra junto porque não é filtrado por RLS: é o privilégio que
 * esvazia a tabela inteira.
 */
describe("api_audit_log é append-only no schema", () => {
  it("nenhum papel tem DELETE, UPDATE ou TRUNCATE", () => {
    const out = sql(`
      select coalesce(string_agg(grantee || ':' || privilege_type, ', ' order by grantee, privilege_type), 'NENHUM')
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'api_audit_log'
        and privilege_type in ('DELETE', 'UPDATE', 'TRUNCATE')
        and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role');
    `);
    expect(
      out.trim(),
      "grant de escrita destrutiva em api_audit_log — a trilha deixou de ser append-only",
    ).toContain("NENHUM");
  });

  it("SELECT e INSERT continuam concedidos — revogar demais quebraria a trilha", () => {
    const out = sql(`
      select string_agg(distinct privilege_type, ',' order by privilege_type)
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'api_audit_log'
        and grantee = 'service_role';
    `);
    expect(out, "service_role precisa escrever a trilha").toContain("INSERT");
    expect(out, "service_role precisa ler a trilha").toContain("SELECT");
  });

  it("o expurgo continua existindo e continua sendo security definer", () => {
    const out = sql(`
      select p.prosecdef::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'fn_expurgar_auditoria_vencida';
    `);
    expect(
      out.trim(),
      "sem a definer, o revoke acima deixaria a retenção sem caminho de execução",
    ).toContain("t");
  });

  it("as três funções de gatilho apontadas pelo linter têm search_path fixo", () => {
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
    expect(out.trim(), "função sem search_path fixo").toContain("NENHUMA");
  });
});
