-- ---- Rascunho preparatório do onboarding (migration 0221) ----
-- Intenção editável, não versão executável: salvar nunca chama IA ou publica agente.
create table if not exists public.onboarding_drafts (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  revision integer not null check (revision > 0),
  configuration jsonb not null check (jsonb_typeof(configuration) = 'object'),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.onboarding_drafts enable row level security;
revoke all on public.onboarding_drafts from public, anon, authenticated;
grant select on public.onboarding_drafts to authenticated;
grant select, insert, update, delete on public.onboarding_drafts to service_role;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public'
    and tablename='onboarding_drafts' and policyname='onboarding_drafts_admin_read') then
    create policy onboarding_drafts_admin_read on public.onboarding_drafts
      for select to authenticated using (
        exists (select 1 from public.user_organizations u
          where u.organization_id = onboarding_drafts.organization_id
            and u.user_id = (select auth.uid()) and u.role='admin'
            and u.accepted_at is not null and u.revoked_at is null)
      );
  end if;
end;
$$;

create or replace function public.fn_save_onboarding_draft(
  p_org_id uuid, p_actor_id uuid, p_expected_revision integer, p_configuration jsonb
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  org public.organizations%rowtype;
  draft public.onboarding_drafts%rowtype;
  next_revision integer;
begin
  if p_expected_revision is null or p_expected_revision < 0
    or p_configuration is null or jsonb_typeof(p_configuration) <> 'object' then
    raise exception 'draft_invalid_input';
  end if;
  if not (p_configuration ?& array['name','prompt_template','regras_da_casa'])
    or (p_configuration - array['name','prompt_template','regras_da_casa']) <> '{}'::jsonb
    or jsonb_typeof(p_configuration->'name') <> 'string'
    or jsonb_typeof(p_configuration->'prompt_template') <> 'string'
    or jsonb_typeof(p_configuration->'regras_da_casa') <> 'string'
    or length(btrim(p_configuration->>'name')) not between 2 and 80
    or length(p_configuration->>'regras_da_casa') > 20000
    or p_configuration->>'prompt_template' not in
      ('ecommerce_friendly','ecommerce_professional','support_minimal') then
    raise exception 'draft_invalid_input';
  end if;
  -- Lock curto e por organização: nenhuma chamada de rede dentro da transação.
  select * into org from public.organizations where id=p_org_id for update;
  if not found then raise exception 'draft_forbidden'; end if;
  perform 1 from public.user_organizations
    where organization_id=p_org_id and user_id=p_actor_id and role='admin'
      and accepted_at is not null and revoked_at is null for share;
  if not found then raise exception 'draft_forbidden'; end if;
  if org.onboarded_at is not null or org.status <> 'active'
    or org.suspended_at is not null or org.redacted_at is not null then
    raise exception 'draft_unavailable';
  end if;
  select * into draft from public.onboarding_drafts where organization_id=p_org_id;
  -- Reenvio inofensivo: mesmo conteúdo já confirmado, nunca uma revisão futura.
  if found and p_expected_revision <= draft.revision
    and draft.configuration = p_configuration then
    return jsonb_build_object('revision',draft.revision,'configuration',draft.configuration);
  end if;
  if p_expected_revision <> coalesce(draft.revision,0) then
    raise exception 'draft_conflict';
  end if;
  next_revision := coalesce(draft.revision,0) + 1;
  insert into public.onboarding_drafts(organization_id,revision,configuration,updated_by)
    values(p_org_id,next_revision,p_configuration,p_actor_id)
    on conflict (organization_id) do update
      set revision=excluded.revision,configuration=excluded.configuration,
        updated_by=excluded.updated_by,updated_at=now();
  insert into public.api_audit_log
    (organization_id,actor_user_id,action,resource_type,resource_id,metadata)
    values(p_org_id,p_actor_id,'onboarding.draft_saved','organization',p_org_id,
      jsonb_build_object('revision',next_revision));
  return jsonb_build_object('revision',next_revision,'configuration',p_configuration);
end;
$$;
revoke execute on function public.fn_save_onboarding_draft(uuid,uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.fn_save_onboarding_draft(uuid,uuid,integer,jsonb) to service_role;
notify pgrst, 'reload schema';
