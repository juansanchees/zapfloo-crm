-- 0234 — Assinatura por organização, fora de organizations.settings.
--
-- Organizações que já existem recebem Completo + ativo para que a atualização
-- não desligue ninguém. Só linhas ausentes entram: reaplicar o baseline nunca
-- desfaz uma escolha feita depois pelo administrador da plataforma.
-- Organizações futuras nascem em teste; o fim continua derivado de
-- organizations.created_at + 168h, sem uma segunda data concorrente.

create table if not exists public.organization_subscriptions (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  plan_id text not null check (plan_id in ('basico', 'essencial', 'completo')),
  status text not null check (status in ('teste', 'ativo', 'pausado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null
);

comment on table public.organization_subscriptions is
  'Plano e situação comercial da organização. Escrita somente pelo backend de administração da plataforma; nunca por settings do tenant.';
comment on column public.organization_subscriptions.plan_id is
  'basico, essencial ou completo. Recursos e preços vivem em lib/billing/planos.ts.';
comment on column public.organization_subscriptions.status is
  'teste usa recursos do Completo por 168h desde organizations.created_at; ativo usa o plano; pausado interrompe somente a IA.';

insert into public.organization_subscriptions (organization_id, plan_id, status)
select o.id, 'completo', 'ativo'
  from public.organizations o
 where not exists (
   select 1 from public.organization_subscriptions s where s.organization_id = o.id
 );

create or replace function public.fn_seed_organization_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organization_subscriptions (organization_id, plan_id, status)
  values (new.id, 'completo', 'teste')
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_seed_organization_subscription on public.organizations;
create trigger trg_seed_organization_subscription
after insert on public.organizations
for each row execute function public.fn_seed_organization_subscription();

drop trigger if exists trg_organization_subscriptions_updated_at on public.organization_subscriptions;
create trigger trg_organization_subscriptions_updated_at
before update on public.organization_subscriptions
for each row execute function public.fn_set_updated_at();

alter table public.organization_subscriptions enable row level security;

drop policy if exists organization_subscriptions_select on public.organization_subscriptions;
create policy organization_subscriptions_select on public.organization_subscriptions
for select to authenticated
using (
  organization_id in (select public.fn_user_org_ids())
  or public.fn_is_platform_admin()
);

-- Não existe policy de escrita: inclusive o admin do tenant não pode se dar
-- plano via PostgREST. A rota de plataforma usa service_role após o guard.
revoke all on table public.organization_subscriptions from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.organization_subscriptions from authenticated;
grant select on table public.organization_subscriptions to authenticated;
grant all on table public.organization_subscriptions to service_role;

revoke execute on function public.fn_seed_organization_subscription()
  from public, anon, authenticated;
grant execute on function public.fn_seed_organization_subscription() to service_role;

notify pgrst, 'reload schema';
