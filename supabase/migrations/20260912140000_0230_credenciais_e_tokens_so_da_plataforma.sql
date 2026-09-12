-- 0230 — credenciais de IA e tokens de API são superfícies da plataforma
--
-- A aplicação já separa o administrador da instalação do administrador de uma
-- organização. Esta migration leva a mesma fronteira até o PostgREST: nenhum
-- papel do tenant enxerga ou altera credenciais/tokens falando direto com o
-- banco. O serviço continua usando service_role, que ignora RLS por desenho.

-- Credenciais: remove a leitura por tenant da 0207 e a escrita de admin do
-- tenant da 0150. A view segura é security_invoker e, portanto, herda esta RLS.
drop policy if exists tenant_isolation_ai_provider_credentials_select
  on public.ai_provider_credentials;
drop policy if exists tenant_isolation_ai_provider_credentials_modify
  on public.ai_provider_credentials;
drop policy if exists tenant_isolation_ai_provider_credentials_write
  on public.ai_provider_credentials;
drop policy if exists ai_provider_credentials_platform_admin_only on public.ai_provider_credentials;

create policy ai_provider_credentials_platform_admin_only
  on public.ai_provider_credentials
  for all
  to authenticated
  using (public.fn_is_platform_admin())
  with check (public.fn_is_platform_admin());

-- Tokens: a policy antiga admitia admin do tenant. O token autentica integrações
-- contra a plataforma inteira, então criação, listagem e revogação ficam com o
-- administrador da instalação.
drop policy if exists api_tokens_admin_only on public.api_tokens;
drop policy if exists api_tokens_platform_admin_only on public.api_tokens;

create policy api_tokens_platform_admin_only
  on public.api_tokens
  for all
  to authenticated
  using (public.fn_is_platform_admin())
  with check (public.fn_is_platform_admin());

-- Defesa em profundidade: a anon key pública não precisa nem do privilégio de
-- tabela. Para authenticated, os grants existentes permanecem e a RLS decide.
revoke all on table public.ai_provider_credentials from anon;
revoke all on table public.ai_provider_credentials_safe from anon;
revoke all on table public.api_tokens from anon;

-- O identificador da credencial também aparece em versões e bindings que o
-- admin do tenant pode editar. RLS da tabela de credenciais não protege uma FK.
-- `base_url` é igualmente sensível: recebe o header Authorization e, se fosse
-- livre, permitiria apontar a chave gerenciada para um host do tenant. O tenant
-- continua livre para configurar modelo e provedor; a referência e o endpoint
-- técnicos ficam imutáveis e são resolvidos pelo servidor com service_role.
-- Registros antigos sem credencial explícita perdem somente o endpoint próprio:
-- manter esse par faria a chave global da instalação sair para um host que não
-- foi aprovado pela plataforma. O modelo/provedor e a execução canônica ficam.
update public.ai_purpose_bindings
set base_url = null
where base_url is not null and credential_id is null;

create or replace function public.fn_proteger_referencia_de_credencial_gerenciada()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin')
     or public.fn_is_platform_admin() then
    return new;
  end if;

  if tg_table_name = 'ai_agent_versions' then
    if (tg_op = 'INSERT' and new.credential_id is not null)
       or (tg_op = 'UPDATE' and (
         new.credential_id is distinct from old.credential_id
         or (new.credential_id is not null and new.provider is distinct from old.provider)
       )) then
      raise insufficient_privilege using
        message = 'ai_provider_infrastructure_platform_only';
    end if;
  elsif tg_op = 'INSERT' then
    if new.credential_id is not null or new.base_url is not null then
      raise insufficient_privilege using
        message = 'ai_provider_infrastructure_platform_only';
    end if;
  elsif new.credential_id is distinct from old.credential_id
     or new.base_url is distinct from old.base_url
     or (new.credential_id is not null and new.provider is distinct from old.provider) then
    raise insufficient_privilege using
      message = 'ai_provider_infrastructure_platform_only';
  end if;

  return new;
end;
$$;

revoke execute on function public.fn_proteger_referencia_de_credencial_gerenciada()
  from public, anon, authenticated;

drop trigger if exists ai_agent_versions_credential_platform_only
  on public.ai_agent_versions;
create trigger ai_agent_versions_credential_platform_only
  before insert or update of credential_id, provider on public.ai_agent_versions
  for each row execute function public.fn_proteger_referencia_de_credencial_gerenciada();

drop trigger if exists ai_purpose_bindings_credential_platform_only
  on public.ai_purpose_bindings;
create trigger ai_purpose_bindings_credential_platform_only
  before insert or update of credential_id, provider, base_url on public.ai_purpose_bindings
  for each row execute function public.fn_proteger_referencia_de_credencial_gerenciada();

notify pgrst, 'reload schema';
