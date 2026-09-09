-- 0227 — preferência pessoal do dashboard.
--
-- A tabela guarda apenas apresentação (ordem, visibilidade e tamanho permitido).
-- Não contém consulta, SQL ou regra de autorização. A pessoa só enxerga e
-- altera a própria linha enquanto continua membro da organização.

create table public.user_dashboard_preferences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  layout jsonb not null,
  schema_version smallint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  constraint user_dashboard_preferences_layout_object
    check (jsonb_typeof(layout) = 'object'),
  constraint user_dashboard_preferences_schema_version_positive
    check (schema_version > 0)
);

create index user_dashboard_preferences_user_idx
  on public.user_dashboard_preferences (user_id);

create trigger trg_user_dashboard_preferences_updated_at
  before update on public.user_dashboard_preferences
  for each row execute function public.fn_set_updated_at();

alter table public.user_dashboard_preferences enable row level security;

create policy user_dashboard_preferences_select_own
  on public.user_dashboard_preferences
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and organization_id in (select public.fn_user_org_ids())
  );

create policy user_dashboard_preferences_insert_own
  on public.user_dashboard_preferences
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and organization_id in (select public.fn_user_org_ids())
  );

create policy user_dashboard_preferences_update_own
  on public.user_dashboard_preferences
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and organization_id in (select public.fn_user_org_ids())
  )
  with check (
    user_id = (select auth.uid())
    and organization_id in (select public.fn_user_org_ids())
  );

create policy user_dashboard_preferences_delete_own
  on public.user_dashboard_preferences
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    and organization_id in (select public.fn_user_org_ids())
  );

revoke all on public.user_dashboard_preferences from anon, public;
grant select, insert, update, delete on public.user_dashboard_preferences to authenticated;

comment on table public.user_dashboard_preferences is
  'Layout pessoal e versionado do dashboard; RLS limita à própria pessoa dentro de organização ativa.';

notify pgrst, 'reload schema';
