-- 0238 — a auditoria vira append-only no schema e três gatilhos fixam search_path
--
-- POR QUE ESTE ARQUIVO EXISTE
--
-- O baseline instala `api_audit_log` depois de default privileges que concedem
-- ALL nas tabelas a anon, authenticated e service_role. Os GRANTs explícitos
-- mais estreitos que aparecem depois não retiram os privilégios herdados. Assim,
-- a garantia de auditoria append-only existia na documentação, mas não no
-- catálogo: service_role tem BYPASSRLS e podia UPDATE/DELETE; TRUNCATE nem passa
-- por RLS e podia esvaziar a tabela inteira.
--
-- POR QUE CADA REVOKE EXISTE
--
-- * PUBLIC: fecha a origem herdada por todo papel, além dos grants nominais.
-- * anon: defesa em profundidade; RLS barra linhas, mas não barra TRUNCATE.
-- * authenticated: mesma razão de anon, preservando somente SELECT/INSERT.
-- * service_role: é o caminho destrutivo real, pois BYPASSRLS ignora policies.
-- * UPDATE: impede reescrever o registro histórico.
-- * DELETE: impede remover seletivamente o registro histórico.
-- * TRUNCATE: impede apagar a trilha inteira fora do alcance da RLS.
--
-- POR QUE A RETENÇÃO CONTINUA FUNCIONANDO
--
-- `fn_expurgar_auditoria_vencida` é SECURITY DEFINER, pertence ao dono da tabela
-- e conserva o piso de 90 dias e o default de 5 anos. service_role mantém apenas
-- EXECUTE nessa função: o expurgo por idade passa pelo caminho estreito, enquanto
-- DML destrutivo direto continua proibido. O dono postgres não entra nos revokes
-- porque o PostgreSQL sempre dá ao proprietário os poderes inerentes necessários
-- para esse desenho SECURITY DEFINER.

revoke delete, update, truncate on table public.api_audit_log from public;
revoke delete, update, truncate on table public.api_audit_log from anon;
revoke delete, update, truncate on table public.api_audit_log from authenticated;
revoke delete, update, truncate on table public.api_audit_log from service_role;

-- Controle positivo: a aplicação ainda precisa inserir e consultar auditoria.
grant select, insert on table public.api_audit_log to authenticated;
grant select, insert on table public.api_audit_log to service_role;

comment on table public.api_audit_log is
  'Trilha append-only: UPDATE/DELETE/TRUNCATE revogados de PUBLIC, anon, authenticated '
  'e service_role pela migration 0238. Remoção somente por '
  'fn_expurgar_auditoria_vencida (SECURITY DEFINER, piso 90 dias, default 5 anos).';

-- O commit original também fechava search_path mutável nestes três gatilhos.
-- Eles ainda existem sem proconfig na main atual. `public, pg_temp` preserva a
-- resolução usada pelos corpos existentes sem reescrevê-los nesta migration.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'fn_agent_versions_immutable'
  ) then
    alter function public.fn_agent_versions_immutable()
      set search_path = public, pg_temp;
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'fn_ai_agent_version_content_immutable'
  ) then
    alter function public.fn_ai_agent_version_content_immutable()
      set search_path = public, pg_temp;
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'fn_contato_anonimizado_limpa_campos_personalizados'
  ) then
    alter function public.fn_contato_anonimizado_limpa_campos_personalizados()
      set search_path = public, pg_temp;
  end if;
end
$$;
