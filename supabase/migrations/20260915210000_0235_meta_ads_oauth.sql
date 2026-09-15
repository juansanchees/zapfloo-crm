-- 0235 — OAuth de anúncios e autorização de agência duráveis, sem bearer no banco.
-- EXPAND apenas: tokens legados continuam válidos e seus metadados ficam NULL
-- (desconhecidos), nunca uma validade inventada. Rollback de app não exige DROP.
--
-- O servidor verifica assinatura/cookie/MFA/plano e o token no provedor. Estas
-- RPCs repetem a autorização vigente e serializam o ciclo por organização.
-- service_role é confiável: os escritores da aplicação usam estas RPCs; SQL
-- administrativo direto não é apresentado como protegido por este protocolo.
-- Nenhuma transação fica aberta durante a troca HTTP do código OAuth.

alter table public.ad_insights_connections
  add column if not exists token_expires_at timestamptz,
  add column if not exists data_access_expires_at timestamptz,
  add column if not exists token_type text,
  add column if not exists token_checked_at timestamptz;

comment on column public.ad_insights_connections.token_expires_at is
  'Expiração real informada pelo provedor. NULL significa desconhecida/sem expiração informada, não 60 dias calculados.';
comment on column public.ad_insights_connections.data_access_expires_at is
  'Prazo de acesso aos dados informado pelo provedor, independente da expiração do token.';
comment on column public.ad_insights_connections.token_type is
  'Tipo real retornado pela inspeção do token. Nunca contém o token nem credenciais.';
comment on column public.ad_insights_connections.token_checked_at is
  'Instante em que o servidor conferiu o token no provedor. NULL nos cadastros legados/manuais.';

create table if not exists public.ad_insights_oauth_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('link', 'session')),
  parent_link_id uuid,
  browser_digest text,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  completed_at timestamptz,
  unique (id, organization_id, user_id),
  foreign key (parent_link_id, organization_id, user_id)
    references public.ad_insights_oauth_requests(id, organization_id, user_id) on delete cascade,
  constraint ad_insights_oauth_requests_browser_check check (
    (kind = 'link' and browser_digest is null and parent_link_id is null and completed_at is null)
    or (kind = 'session' and browser_digest is not null and browser_digest ~ '^[a-f0-9]{64}$')
  ),
  constraint ad_insights_oauth_requests_prazo_check check (
    expires_at > created_at and expires_at <= created_at +
      case kind when 'link' then interval '30 minutes' else interval '10 minutes' end
  ),
  constraint ad_insights_oauth_requests_conclusao_check check (
    completed_at is null or (kind = 'session' and consumed_at is not null)
  )
);

comment on table public.ad_insights_oauth_requests is
  'Capacidades server-side de conexão de anúncios: link de agência 30min, sessão OAuth 10min; assinatura fica fora do banco, vínculo do navegador é SHA256. Consumo e conclusão distintos impedem replay e gravação após desconectar.';
create index if not exists ad_insights_oauth_requests_org_pendentes_idx
  on public.ad_insights_oauth_requests(organization_id, expires_at)
  where revoked_at is null and completed_at is null;
create index if not exists ad_insights_oauth_requests_expiracao_idx
  on public.ad_insights_oauth_requests(expires_at);
create index if not exists ad_insights_oauth_requests_parent_idx
  on public.ad_insights_oauth_requests(parent_link_id);
alter table public.ad_insights_oauth_requests enable row level security;
revoke all on public.ad_insights_oauth_requests from public, anon, authenticated;
grant select, insert, update, delete on public.ad_insights_oauth_requests to service_role;

-- Ordem única de locks: organização -> autorização -> solicitação -> conexão.
-- Locks de autorização impedem revogação concorrente entre a conferência e a
-- escrita; clock_timestamp é lido DEPOIS de adquirir o lock, não no BEGIN.
create or replace function public.fn_ad_insights_oauth_autorizar(
  p_organization_id uuid, p_user_id uuid, p_admin_only boolean default false
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.organizations o
    where o.id = p_organization_id and o.status = 'active'
      and o.suspended_at is null and o.redacted_at is null for update;
  if not found then return false; end if;
  perform 1 from public.platform_admins p
    where p.user_id = p_user_id and p.revoked_at is null and p.scope = 'full' for share;
  if found then return true; end if;
  perform 1 from public.user_organizations u
    where u.organization_id = p_organization_id and u.user_id = p_user_id
      and u.accepted_at is not null and u.revoked_at is null
      and (u.role = 'admin' or (not p_admin_only and u.role = 'manager')) for share;
  return found;
end;
$$;
revoke execute on function public.fn_ad_insights_oauth_autorizar(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.fn_ad_insights_oauth_autorizar(uuid, uuid, boolean) to service_role;

create or replace function public.fn_ad_insights_oauth_emitir_link(
  p_organization_id uuid, p_user_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_now timestamptz;
begin
  if not public.fn_ad_insights_oauth_autorizar(p_organization_id, p_user_id) then
    return jsonb_build_object('status', 'forbidden');
  end if;
  v_now := clock_timestamp();
  insert into public.ad_insights_oauth_requests(id, organization_id, user_id, kind, created_at, expires_at)
    values(v_id, p_organization_id, p_user_id, 'link', v_now, v_now + interval '30 minutes');
  return jsonb_build_object('status', 'ok', 'id', v_id, 'expires_at', v_now + interval '30 minutes');
end;
$$;
revoke execute on function public.fn_ad_insights_oauth_emitir_link(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_ad_insights_oauth_emitir_link(uuid, uuid) to service_role;

create or replace function public.fn_ad_insights_oauth_iniciar(
  p_organization_id uuid, p_user_id uuid, p_browser_digest text, p_link_id uuid default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_now timestamptz;
begin
  if p_browser_digest is null or p_browser_digest !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('status', 'invalid_request');
  end if;
  if not public.fn_ad_insights_oauth_autorizar(p_organization_id, p_user_id) then
    return jsonb_build_object('status', 'forbidden');
  end if;
  v_now := clock_timestamp();
  if p_link_id is not null then
    -- Um único UPDATE reivindica o link; concorrência ou prazo vencido não
    -- produz outra sessão. O chamador já verificou a assinatura do link.
    update public.ad_insights_oauth_requests r set consumed_at = v_now
      where r.id = p_link_id and r.organization_id = p_organization_id
        and r.user_id = p_user_id and r.kind = 'link'
        and r.expires_at > v_now and r.consumed_at is null and r.revoked_at is null;
    if not found then return jsonb_build_object('status', 'request_unavailable'); end if;
  end if;
  insert into public.ad_insights_oauth_requests
    (id, organization_id, user_id, kind, parent_link_id, browser_digest, created_at, expires_at)
    values(v_id, p_organization_id, p_user_id, 'session', p_link_id, p_browser_digest, v_now, v_now + interval '10 minutes');
  return jsonb_build_object('status', 'ok', 'id', v_id, 'user_id', p_user_id,
    'parent_link_id', p_link_id, 'expires_at', v_now + interval '10 minutes');
end;
$$;
revoke execute on function public.fn_ad_insights_oauth_iniciar(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.fn_ad_insights_oauth_iniciar(uuid, uuid, text, uuid) to service_role;

create or replace function public.fn_ad_insights_oauth_consumir(
  p_organization_id uuid, p_request_id uuid, p_browser_digest text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_user_id uuid;
  v_request public.ad_insights_oauth_requests%rowtype;
  v_now timestamptz;
begin
  select r.user_id into v_user_id from public.ad_insights_oauth_requests r
    where r.id = p_request_id and r.organization_id = p_organization_id and r.kind = 'session';
  if v_user_id is null then return jsonb_build_object('status', 'request_unavailable'); end if;
  if not public.fn_ad_insights_oauth_autorizar(p_organization_id, v_user_id) then
    return jsonb_build_object('status', 'forbidden');
  end if;
  v_now := clock_timestamp();
  update public.ad_insights_oauth_requests r set consumed_at = v_now
    where r.id = p_request_id and r.organization_id = p_organization_id and r.kind = 'session'
      and r.browser_digest = p_browser_digest and r.expires_at > v_now
      and r.consumed_at is null and r.revoked_at is null and r.completed_at is null
      and (r.parent_link_id is null or exists (
        select 1 from public.ad_insights_oauth_requests parent
          where parent.id = r.parent_link_id and parent.organization_id = p_organization_id
            and parent.user_id = r.user_id and parent.kind = 'link'
            and parent.consumed_at is not null and parent.revoked_at is null
      )) returning r.* into v_request;
  if not found then return jsonb_build_object('status', 'request_unavailable'); end if;
  return jsonb_build_object('status', 'ok', 'user_id', v_request.user_id,
    'parent_link_id', v_request.parent_link_id,
    'origin', case when v_request.parent_link_id is null then 'direct' else 'agency' end);
end;
$$;
revoke execute on function public.fn_ad_insights_oauth_consumir(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fn_ad_insights_oauth_consumir(uuid, uuid, text) to service_role;

create or replace function public.fn_ad_insights_oauth_concluir(
  p_organization_id uuid, p_request_id uuid, p_browser_digest text,
  p_access_token_encrypted bytea, p_default_account_id text default null,
  p_token_expires_at timestamptz default null, p_data_access_expires_at timestamptz default null,
  p_token_type text default null, p_token_checked_at timestamptz default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_user_id uuid;
  v_request public.ad_insights_oauth_requests%rowtype;
  v_now timestamptz;
begin
  if p_access_token_encrypted is null or octet_length(p_access_token_encrypted) = 0
     or (p_default_account_id is not null and p_default_account_id !~ '^act_[0-9]+$')
     or (p_token_type is not null and length(p_token_type) > 64) then
    return jsonb_build_object('status', 'invalid_request');
  end if;
  select r.user_id into v_user_id from public.ad_insights_oauth_requests r
    where r.id = p_request_id and r.organization_id = p_organization_id and r.kind = 'session';
  if v_user_id is null then return jsonb_build_object('status', 'request_unavailable'); end if;
  if not public.fn_ad_insights_oauth_autorizar(p_organization_id, v_user_id) then
    return jsonb_build_object('status', 'forbidden');
  end if;
  v_now := clock_timestamp();
  update public.ad_insights_oauth_requests r set completed_at = v_now
    where r.id = p_request_id and r.organization_id = p_organization_id and r.kind = 'session'
      and r.browser_digest = p_browser_digest and r.expires_at > v_now
      and r.consumed_at is not null and r.revoked_at is null and r.completed_at is null
      and (r.parent_link_id is null or exists (
        select 1 from public.ad_insights_oauth_requests parent
          where parent.id = r.parent_link_id and parent.organization_id = p_organization_id
            and parent.user_id = r.user_id and parent.kind = 'link'
            and parent.consumed_at is not null and parent.revoked_at is null
      )) returning r.* into v_request;
  if not found then return jsonb_build_object('status', 'request_unavailable'); end if;

  insert into public.ad_insights_connections
    (organization_id, platform, access_token_encrypted, default_account_id, updated_by,
     token_expires_at, data_access_expires_at, token_type, token_checked_at)
    values(p_organization_id, 'meta_ads', p_access_token_encrypted, p_default_account_id, v_user_id,
      p_token_expires_at, p_data_access_expires_at, p_token_type, p_token_checked_at)
    on conflict (organization_id, platform) do update set
      access_token_encrypted = excluded.access_token_encrypted,
      default_account_id = excluded.default_account_id,
      updated_by = excluded.updated_by,
      token_expires_at = excluded.token_expires_at,
      data_access_expires_at = excluded.data_access_expires_at,
      token_type = excluded.token_type,
      token_checked_at = excluded.token_checked_at;
  -- Outra autorização anterior não pode sobrescrever a conexão recém-aprovada.
  update public.ad_insights_oauth_requests set revoked_at = v_now
    where organization_id = p_organization_id and id <> p_request_id
      and revoked_at is null and completed_at is null;
  return jsonb_build_object('status', 'ok', 'user_id', v_request.user_id,
    'parent_link_id', v_request.parent_link_id);
end;
$$;
revoke execute on function public.fn_ad_insights_oauth_concluir(uuid, uuid, text, bytea, text, timestamptz, timestamptz, text, timestamptz) from public, anon, authenticated;
grant execute on function public.fn_ad_insights_oauth_concluir(uuid, uuid, text, bytea, text, timestamptz, timestamptz, text, timestamptz) to service_role;

-- Todas as mutações da aplicação passam pela mesma ordem de locks. Não usamos
-- trigger ROW: ele já teria lock da conexão antes da organização, invertendo
-- a ordem de concluir() e introduzindo deadlock. O token nunca é parâmetro cru.
create or replace function public.fn_ad_insights_mutar_conexao(
  p_organization_id uuid, p_user_id uuid, p_operation text,
  p_access_token_encrypted bytea default null, p_default_account_id text default null,
  p_alterar_conta boolean default false, p_expected_token_encrypted bytea default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_now timestamptz;
  v_exists boolean;
begin
  if p_operation is null or p_operation not in ('save', 'disconnect', 'select_account')
     or (p_default_account_id is not null and p_default_account_id !~ '^act_[0-9]+$')
     or (p_access_token_encrypted is not null and octet_length(p_access_token_encrypted) = 0)
     or (p_operation = 'select_account' and (p_default_account_id is null or p_access_token_encrypted is not null)) then
    return jsonb_build_object('status', 'invalid_request');
  end if;
  if not public.fn_ad_insights_oauth_autorizar(p_organization_id, p_user_id, p_operation <> 'select_account') then
    return jsonb_build_object('status', 'forbidden');
  end if;
  v_now := clock_timestamp();
  if p_operation = 'disconnect' then
    -- Também revoga o link de quem AINDA não tinha conexão alguma.
    update public.ad_insights_oauth_requests set revoked_at = v_now
      where organization_id = p_organization_id and revoked_at is null and completed_at is null;
    delete from public.ad_insights_connections
      where organization_id = p_organization_id and platform = 'meta_ads';
    return jsonb_build_object('status', 'ok');
  end if;
  select exists(select 1 from public.ad_insights_connections
    where organization_id = p_organization_id and platform = 'meta_ads') into v_exists;
  if p_operation = 'select_account' then
    if not v_exists then return jsonb_build_object('status', 'request_unavailable'); end if;
    update public.ad_insights_connections set default_account_id = p_default_account_id, updated_by = p_user_id
      where organization_id = p_organization_id and platform = 'meta_ads'
        and access_token_encrypted = p_expected_token_encrypted;
    if not found then return jsonb_build_object('status', 'request_unavailable'); end if;
    return jsonb_build_object('status', 'ok');
  end if;
  if p_access_token_encrypted is null then
    if not v_exists then return jsonb_build_object('status', 'invalid_request'); end if;
    if p_alterar_conta then
      update public.ad_insights_connections set default_account_id = p_default_account_id, updated_by = p_user_id
        where organization_id = p_organization_id and platform = 'meta_ads';
    end if;
  else
    update public.ad_insights_oauth_requests set revoked_at = v_now
      where organization_id = p_organization_id and revoked_at is null and completed_at is null;
    insert into public.ad_insights_connections
      (organization_id, platform, access_token_encrypted, default_account_id, updated_by)
      values(p_organization_id, 'meta_ads', p_access_token_encrypted, p_default_account_id, p_user_id)
      on conflict (organization_id, platform) do update set
        access_token_encrypted = excluded.access_token_encrypted,
        default_account_id = case when p_alterar_conta then excluded.default_account_id
          else public.ad_insights_connections.default_account_id end,
        updated_by = excluded.updated_by,
        token_expires_at = null, data_access_expires_at = null, token_type = null, token_checked_at = null;
  end if;
  return jsonb_build_object('status', 'ok', 'first_connection', not v_exists,
    'token_changed', p_access_token_encrypted is not null);
end;
$$;
revoke execute on function public.fn_ad_insights_mutar_conexao(uuid, uuid, text, bytea, text, boolean, bytea) from public, anon, authenticated;
grant execute on function public.fn_ad_insights_mutar_conexao(uuid, uuid, text, bytea, text, boolean, bytea) to service_role;

-- Limpeza tem dono: data-retention chama em lotes e audita só quando removeu.
-- Primeiro folhas, depois pais: a contagem não omite remoções por CASCADE nem
-- a retenção de um pai encurta a de sua sessão. O próximo lote remove o pai.
create or replace function public.fn_ad_insights_oauth_expurgar(
  p_retencao_dias int default 1, p_limite int default 1000
) returns int language plpgsql security invoker set search_path = '' as $$
declare
  v_count int;
begin
  with vencidas as (
    select r.id from public.ad_insights_oauth_requests r
      where r.expires_at < clock_timestamp() - make_interval(days => greatest(coalesce(p_retencao_dias, 1), 1))
        and not exists (select 1 from public.ad_insights_oauth_requests child where child.parent_link_id = r.id)
      order by r.expires_at, r.id
      limit least(greatest(coalesce(p_limite, 1000), 1), 1000)
      for update of r skip locked
  )
  delete from public.ad_insights_oauth_requests r using vencidas v where r.id = v.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.fn_ad_insights_oauth_expurgar(int, int) from public, anon, authenticated;
grant execute on function public.fn_ad_insights_oauth_expurgar(int, int) to service_role;

-- O kit aplica por statement: a notificação de um bloco anterior não cobre estas RPCs.
notify pgrst, 'reload schema';
