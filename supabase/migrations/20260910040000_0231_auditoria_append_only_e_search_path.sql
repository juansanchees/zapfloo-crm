-- 0231 — a auditoria vira append-only DE VERDADE, e três gatilhos ganham search_path fixo
--
-- ═══ POR QUE ESTE ARQUIVO EXISTE ═══
--
-- A migration 0167 afirma, no próprio cabeçalho, que `api_audit_log` é
-- "append-only NO SCHEMA, não só na prosa: o baseline concede SELECT, INSERT,
-- REFERENCES, TRIGGER, TRUNCATE, MAINTAIN a anon, authenticated E service_role
-- — DELETE e UPDATE não estão lá para ninguém". O `CLAUDE.md` repete a frase e
-- a usa como garantia de integridade da auditoria.
--
-- MEDIDO em 2026-09-10, numa instalação real (Supabase Cloud, pg 17.6.1):
--
--   grantee        privilege
--   service_role   TRUNCATE, DELETE, UPDATE
--   authenticated  TRUNCATE, DELETE, UPDATE
--   anon           TRUNCATE, DELETE, UPDATE
--   postgres       TRUNCATE, DELETE, UPDATE
--
-- A causa está no próprio baseline, linhas 4890-4893:
--
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     GRANT ALL ON TABLES TO postgres / anon / authenticated / service_role;
--
-- `api_audit_log` nasce DEPOIS dessas linhas e herda GRANT ALL. Nenhum revoke
-- existe em lugar nenhum do repositório (`grep -in "revoke.*api_audit_log"` no
-- baseline volta vazio). Logo a afirmação é falsa em TODA instalação, não só
-- na que foi medida — e das cinco razões que a 0167 enumera, a (d) ("não
-- amplia o raio de quem já tem a chave") era a única que se sustentava.
--
-- ═══ O QUE MUDA DE FATO ═══
--
-- `anon` e `authenticated` JÁ eram barrados pela RLS: as únicas policies da
-- tabela são `audit_log_insert_tenant_member` (INSERT) e `audit_log_select`
-- (SELECT). Sem policy de DELETE nem de UPDATE, a RLS nega os dois. Para eles
-- o revoke é cinto sobre suspensório.
--
-- Quem tinha poder real é `service_role`, que no Supabase tem BYPASSRLS: com o
-- grant, qualquer portador da service key reescreve ou apaga histórico de
-- auditoria sem deixar rastro. Depois deste arquivo, não reescreve mais.
--
-- TRUNCATE entra junto porque NÃO é filtrado por RLS. Ele não é alcançável
-- pelo PostgREST (que nunca o emite), então não é buraco de superfície — mas é
-- o privilégio que esvazia a tabela INTEIRA, e mantê-lo concedido contradiz a
-- mesma frase que este arquivo existe para tornar verdadeira.
--
-- ═══ POR QUE O EXPURGO NÃO QUEBRA ═══
--
-- `fn_expurgar_auditoria_vencida` é `security definer` e roda como o DONO da
-- tabela — o revoke de `service_role` não a alcança. É exatamente o desenho
-- que a 0167 descreveu e que só agora passa a valer de fato. O cron
-- `app/api/v1/cron/data-retention` a chama por RPC, nunca com DELETE direto
-- (conferido: não há delete/update de `api_audit_log` em app/, lib/ ou
-- workers/). Apagar organização INSERE em `api_audit_log` (ver 0115), não
-- apaga — também não é afetado. Ações referenciais de FK rodam como o dono da
-- tabela referenciante, então cascade eventual também segue funcionando.
--
-- O molde veio de dentro do próprio repo: as tabelas `ad_*` já fazem
-- `revoke all ... from anon, authenticated` mais `grant <só o necessário> to
-- service_role`. Aqui o necessário é SELECT e INSERT, e nada além.

-- ---- api_audit_log: append-only no schema (migration 0231) ----

revoke delete, update, truncate on table public.api_audit_log from public;
revoke delete, update, truncate on table public.api_audit_log from anon;
revoke delete, update, truncate on table public.api_audit_log from authenticated;
revoke delete, update, truncate on table public.api_audit_log from service_role;

-- O que a tabela PRECISA continuar tendo, declarado explicitamente para que uma
-- leitura futura não confunda "revogado" com "sem acesso": a escrita da trilha
-- e a leitura pelas policies existentes.
grant select, insert on table public.api_audit_log to authenticated;
grant select, insert on table public.api_audit_log to service_role;

comment on table public.api_audit_log is
  'Trilha de auditoria append-only. DELETE/UPDATE/TRUNCATE revogados de public, anon, '
  'authenticated e service_role na migration 0231 — antes dela o ALTER DEFAULT PRIVILEGES '
  'do baseline concedia GRANT ALL e a garantia existia só na prosa. O único caminho de '
  'remoção é fn_expurgar_auditoria_vencida (security definer, piso de 90 dias no corpo, '
  'sem seletor de linha), chamada pelo cron data-retention. Retenção default: 5 anos.';

-- ---- search_path fixo em três funções de gatilho (migration 0231) ----
--
-- O linter do Supabase (0011_function_search_path_mutable) aponta três funções
-- de `public` sem `search_path` fixo. As três são `security invoker` e de
-- gatilho — o vetor é menor que o de uma `definer`, mas resolução de nome que
-- depende de quem chama continua sendo resolução de nome que depende de quem
-- chama, e a `fn_agent_versions_immutable` está pendurada em SETE gatilhos.
--
-- Fixado em `public, pg_temp` e NÃO em `''`: as três já existem e não foram
-- reescritas aqui. `''` obrigaria a qualificar cada referência do corpo, o que
-- é mudança de comportamento sem teste que a cubra. `public, pg_temp` mata o
-- alerta e preserva exatamente a resolução de hoje. Função NOVA continua
-- nascendo com `search_path = ''`, como manda a doutrina.
--
-- `if exists` em cada uma: o baseline de um clone antigo pode não ter as três.

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'fn_agent_versions_immutable') then
    alter function public.fn_agent_versions_immutable() set search_path = public, pg_temp;
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'fn_ai_agent_version_content_immutable') then
    alter function public.fn_ai_agent_version_content_immutable() set search_path = public, pg_temp;
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'fn_contato_anonimizado_limpa_campos_personalizados') then
    alter function public.fn_contato_anonimizado_limpa_campos_personalizados() set search_path = public, pg_temp;
  end if;
end $$;
