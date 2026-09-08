-- 0220 — rascunho pode existir antes da conexão; publicação continua exigindo canal.
-- Nenhuma versão, credencial ou autorização existente é reescrita.
alter table public.ai_agent_versions
  alter column channel_session_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ai_agent_versions'::regclass
      and conname = 'ai_agent_versions_canal_ao_publicar'
  ) then
    alter table public.ai_agent_versions
      add constraint ai_agent_versions_canal_ao_publicar
      check (channel_session_id is not null or status in ('draft', 'archived'));
  end if;
end;
$$;

notify pgrst, 'reload schema';
