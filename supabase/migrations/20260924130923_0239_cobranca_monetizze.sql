-- 0239 — cobrança Monetizze com rollout desligado, ledger server-only e
-- incidente global deduplicado quando a verificação comercial fica indisponível.
--
-- EXPAND forward-only: não atualiza nenhuma assinatura existente. Os campos
-- externos são nullable e a única linha criada é a configuração global com o
-- bloqueio DESLIGADO. A RPC recebe somente o evento já normalizado; corpo cru,
-- chave da conta e PII não entram neste contrato.

alter table public.organization_subscriptions
  add column if not exists billing_provider text,
  add column if not exists external_subscription_id text,
  add column if not exists last_sale_code text,
  add column if not exists last_payment_at timestamptz,
  add column if not exists paid_through timestamptz,
  add column if not exists access_until timestamptz,
  add column if not exists last_billing_event_at timestamptz,
  add column if not exists last_billing_installment integer;

alter table public.organization_subscriptions
  drop constraint if exists organization_subscriptions_status_check;
alter table public.organization_subscriptions
  add constraint organization_subscriptions_status_check
  check (status in ('teste', 'ativo', 'recusado', 'cancelado', 'pausado'));

comment on column public.organization_subscriptions.status is
  'teste usa recursos do Completo por 168h desde organizations.created_at; ativo usa o plano; pausado bloqueia o produto mesmo com enforcement_enabled desligado; recusado e cancelado seguem a política comercial.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.organization_subscriptions'::regclass
       and conname = 'organization_subscriptions_billing_provider_check'
  ) then
    alter table public.organization_subscriptions
      add constraint organization_subscriptions_billing_provider_check
      check (billing_provider is null or billing_provider = 'monetizze');
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.organization_subscriptions'::regclass
       and conname = 'organization_subscriptions_installment_check'
  ) then
    alter table public.organization_subscriptions
      add constraint organization_subscriptions_installment_check
      check (last_billing_installment is null or last_billing_installment >= 0);
  end if;
end
$$;

comment on column public.organization_subscriptions.billing_provider is
  'Origem server-side da projeção comercial. NULL identifica linha legada ainda não vinculada.';
comment on column public.organization_subscriptions.external_subscription_id is
  'Identificador externo da assinatura; nunca é usado como resource_id de auditoria.';
comment on column public.organization_subscriptions.last_sale_code is
  'Venda externa mais recente aplicada; aparece somente em metadata de auditoria.';
comment on column public.organization_subscriptions.last_payment_at is
  'Instante do último pagamento confirmado pelo provedor.';
comment on column public.organization_subscriptions.paid_through is
  'Fim do período mensal já pago, sem a tolerância comercial.';
comment on column public.organization_subscriptions.access_until is
  'Fim do acesso calculado pela regra comercial, incluindo tolerância quando aplicável.';
comment on column public.organization_subscriptions.last_billing_event_at is
  'Relógio monotônico do último evento externo aplicado.';
comment on column public.organization_subscriptions.last_billing_installment is
  'Parcela usada como desempate monotônico quando dois eventos têm o mesmo instante.';

create table if not exists public.platform_billing_settings (
  singleton boolean primary key default true,
  enforcement_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint platform_billing_settings_singleton_check check (singleton)
);

insert into public.platform_billing_settings(singleton, enforcement_enabled)
values (true, false)
on conflict (singleton) do nothing;

comment on table public.platform_billing_settings is
  'Configuração global server-only da cobrança. O bloqueio nasce e permanece desligado até ação explícita do administrador da plataforma.';

drop trigger if exists trg_platform_billing_settings_updated_at on public.platform_billing_settings;
create trigger trg_platform_billing_settings_updated_at
before update on public.platform_billing_settings
for each row execute function public.fn_set_updated_at();

alter table public.platform_billing_settings enable row level security;
revoke all on table public.platform_billing_settings from public, anon, authenticated;
grant select, insert, update, delete on table public.platform_billing_settings to service_role;

-- Durante uma queda do leitor, cada processo pode tentar avisar. Este índice é
-- a contenção global e atômica: só um incidente fica aberto; depois de
-- resolvido, uma indisponibilidade futura pode abrir outro.
create unique index if not exists incidents_billing_verification_open_unique
  on public.incidents ((type))
  where organization_id is null
    and type = 'billing_verification_unavailable'
    and status <> 'resolved';

create table if not exists public.billing_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'monetizze',
  webhook_id text not null,
  sale_code text not null,
  sale_status text not null,
  event_kind text not null,
  event_at timestamptz not null,
  installment_number integer,
  product_code text not null,
  subscription_code text,
  buyer_email_hash text,
  buyer_email_masked text,
  organization_id uuid references public.organizations(id) on delete set null,
  plan_id text,
  target_status text,
  payment_confirmed_at timestamptz,
  paid_through timestamptz,
  access_until timestamptz,
  outcome text not null default 'pending_match',
  error_code text,
  received_at timestamptz not null default clock_timestamp(),
  processed_at timestamptz,
  constraint billing_provider_events_provider_check check (provider = 'monetizze'),
  constraint billing_provider_events_webhook_id_key unique (webhook_id),
  constraint billing_provider_events_sale_status_key unique (sale_code, sale_status),
  constraint billing_provider_events_installment_check check (installment_number is null or installment_number >= 0),
  constraint billing_provider_events_plan_check check (plan_id is null or plan_id in ('basico', 'essencial', 'completo')),
  constraint billing_provider_events_target_status_check check (
    target_status is null or target_status in ('teste', 'ativo', 'recusado', 'cancelado', 'pausado')
  ),
  constraint billing_provider_events_outcome_check check (outcome in (
    'applied', 'pending_match', 'ignored_unknown_product', 'ignored_event',
    'ignored_out_of_order', 'failed'
  )),
  constraint billing_provider_events_email_hash_check check (
    buyer_email_hash is null or buyer_email_hash ~ '^[a-f0-9]{64}$'
  ),
  constraint billing_provider_events_email_masked_check check (
    buyer_email_masked is null or (
      length(buyer_email_masked) <= 320
      and buyer_email_masked !~ E'[\\r\\n]'
      and buyer_email_masked ~ '^[^@]+@[^@]+$'
      and position('*' in split_part(buyer_email_masked, '@', 1)) > 0
    )
  ),
  constraint billing_provider_events_error_code_check check (
    error_code is null or (length(error_code) between 1 and 120 and error_code ~ '^[a-z0-9._:-]+$')
  )
);

create index if not exists billing_provider_events_outcome_received_idx
  on public.billing_provider_events(outcome, received_at desc);
create index if not exists billing_provider_events_organization_received_idx
  on public.billing_provider_events(organization_id, received_at desc)
  where organization_id is not null;

comment on table public.billing_provider_events is
  'Ledger server-only de eventos comerciais normalizados. Não guarda corpo cru, chave da conta, e-mail aberto, nome, documento ou telefone.';

alter table public.billing_provider_events enable row level security;
revoke all on table public.billing_provider_events from public, anon, authenticated;
grant select, insert, update, delete on table public.billing_provider_events to service_role;

create or replace function public.fn_processar_evento_monetizze(
  p_webhook_id text,
  p_sale_code text,
  p_sale_status text,
  p_event_kind text,
  p_event_at timestamptz,
  p_installment_number integer,
  p_product_code text,
  p_subscription_code text,
  p_buyer_email_hash text,
  p_buyer_email_masked text,
  p_organization_id uuid,
  p_plan_id text,
  p_target_status text,
  p_payment_confirmed_at timestamptz,
  p_paid_through timestamptz,
  p_access_until timestamptz,
  p_outcome text,
  p_error_code text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_existing_event_id uuid;
  v_current public.organization_subscriptions%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if nullif(btrim(p_webhook_id), '') is null
     or nullif(btrim(p_sale_code), '') is null
     or nullif(btrim(p_sale_status), '') is null
     or nullif(btrim(p_event_kind), '') is null
     or p_event_at is null
     or nullif(btrim(p_product_code), '') is null
     or p_installment_number < 0
     or p_plan_id is not null and p_plan_id not in ('basico', 'essencial', 'completo')
     or p_target_status is not null and p_target_status not in ('teste', 'ativo', 'recusado', 'cancelado', 'pausado')
     or p_outcome not in ('applied', 'pending_match', 'ignored_unknown_product', 'ignored_event', 'failed')
     or p_outcome = 'applied' and (p_organization_id is null or p_plan_id is null or p_target_status is null)
  then
    return jsonb_build_object('status', 'invalid_request');
  end if;

  insert into public.billing_provider_events(
    webhook_id, sale_code, sale_status, event_kind, event_at,
    installment_number, product_code, subscription_code,
    buyer_email_hash, buyer_email_masked, organization_id, plan_id,
    target_status, payment_confirmed_at, paid_through, access_until,
    outcome, error_code, processed_at
  ) values (
    p_webhook_id, p_sale_code, p_sale_status, p_event_kind, p_event_at,
    p_installment_number, p_product_code, p_subscription_code,
    p_buyer_email_hash, p_buyer_email_masked, p_organization_id, p_plan_id,
    p_target_status, p_payment_confirmed_at, p_paid_through, p_access_until,
    p_outcome, p_error_code,
    case when p_outcome = 'pending_match' then null else v_now end
  )
  on conflict do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select e.id into v_existing_event_id
      from public.billing_provider_events e
     where e.webhook_id = p_webhook_id
        or (e.sale_code = p_sale_code and e.sale_status = p_sale_status)
     order by e.received_at, e.id
     limit 1;
    return jsonb_build_object('status', 'duplicate', 'event_id', v_existing_event_id);
  end if;

  if p_outcome <> 'applied' then
    return jsonb_build_object('status', p_outcome, 'event_id', v_event_id);
  end if;

  -- Serializa a projeção por organização inclusive quando ainda não existe
  -- organization_subscriptions. Sem este lock, dois primeiros eventos poderiam
  -- observar ausência ao mesmo tempo e o mais antigo vencer o UPSERT por último.
  perform 1
    from public.organizations o
   where o.id = p_organization_id
   for update;

  select s.* into v_current
    from public.organization_subscriptions s
   where s.organization_id = p_organization_id
   for update;

  if found and v_current.last_billing_event_at is not null and (
    p_event_at < v_current.last_billing_event_at
    or (
      p_event_at = v_current.last_billing_event_at
      and coalesce(p_installment_number, 0) <= coalesce(v_current.last_billing_installment, 0)
    )
  ) then
    update public.billing_provider_events
       set outcome = 'ignored_out_of_order', processed_at = v_now
     where id = v_event_id;
    return jsonb_build_object('status', 'ignored_out_of_order', 'event_id', v_event_id);
  end if;

  insert into public.organization_subscriptions(
    organization_id, plan_id, status, billing_provider,
    external_subscription_id, last_sale_code, last_payment_at,
    paid_through, access_until, last_billing_event_at,
    last_billing_installment, updated_by
  ) values (
    p_organization_id, p_plan_id, p_target_status, 'monetizze',
    p_subscription_code, p_sale_code, p_payment_confirmed_at,
    p_paid_through, p_access_until, p_event_at,
    p_installment_number, null
  )
  on conflict (organization_id) do update set
    plan_id = excluded.plan_id,
    status = excluded.status,
    billing_provider = excluded.billing_provider,
    external_subscription_id = coalesce(excluded.external_subscription_id, public.organization_subscriptions.external_subscription_id),
    last_sale_code = excluded.last_sale_code,
    last_payment_at = coalesce(excluded.last_payment_at, public.organization_subscriptions.last_payment_at),
    paid_through = coalesce(excluded.paid_through, public.organization_subscriptions.paid_through),
    access_until = coalesce(excluded.access_until, public.organization_subscriptions.access_until),
    last_billing_event_at = excluded.last_billing_event_at,
    last_billing_installment = coalesce(excluded.last_billing_installment, public.organization_subscriptions.last_billing_installment),
    updated_by = null;

  insert into public.api_audit_log(
    organization_id, action, resource_type, resource_id, bypassed_rls, metadata
  ) values (
    p_organization_id,
    'billing.subscription_updated',
    'organization_subscription',
    p_organization_id,
    true,
    jsonb_build_object(
      'provider', 'monetizze',
      'webhook_id', p_webhook_id,
      'sale_code', p_sale_code,
      'sale_status', p_sale_status,
      'subscription_code', p_subscription_code,
      'event_at', p_event_at,
      'installment_number', p_installment_number,
      'plan_id', p_plan_id,
      'status', p_target_status
    )
  );

  return jsonb_build_object('status', 'applied', 'event_id', v_event_id);
end;
$$;

comment on function public.fn_processar_evento_monetizze(
  text, text, text, text, timestamptz, integer, text, text, text, text,
  uuid, text, text, timestamptz, timestamptz, timestamptz, text, text
) is
  'Reivindica evento comercial normalizado, recusa duplicata/out-of-order e projeta assinatura atomicamente. Não recebe corpo cru ou chave da conta.';

revoke execute on function public.fn_processar_evento_monetizze(
  text, text, text, text, timestamptz, integer, text, text, text, text,
  uuid, text, text, timestamptz, timestamptz, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function public.fn_processar_evento_monetizze(
  text, text, text, text, timestamptz, integer, text, text, text, text,
  uuid, text, text, timestamptz, timestamptz, timestamptz, text, text
) to service_role;

create or replace function public.fn_vincular_evento_monetizze(
  p_event_id uuid,
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event public.billing_provider_events%rowtype;
  v_before_subscription public.organization_subscriptions%rowtype;
  v_after_subscription public.organization_subscriptions%rowtype;
  v_has_subscription boolean := false;
  v_outcome text;
  v_now timestamptz := clock_timestamp();
  v_before jsonb;
  v_after jsonb;
begin
  if p_event_id is null
     or p_organization_id is null
     or p_actor_user_id is null
     or nullif(btrim(p_reason), '') is null
     or length(p_reason) > 500
     or p_reason ~ E'[\\r\\n]'
  then
    return jsonb_build_object('status', 'invalid_request');
  end if;

  -- O lock é o claim: duas conciliações do mesmo evento nunca observam
  -- pending_match ao mesmo tempo nem duplicam projeção/auditoria.
  select e.* into v_event
    from public.billing_provider_events e
   where e.id = p_event_id
   for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_event.outcome <> 'pending_match' then
    if v_event.outcome = 'applied' and v_event.organization_id = p_organization_id then
      return jsonb_build_object('status', 'already_linked', 'event_id', v_event.id);
    end if;
    return jsonb_build_object('status', 'not_pending', 'event_id', v_event.id);
  end if;
  if v_event.plan_id is null or v_event.target_status is null then
    return jsonb_build_object('status', 'invalid_event', 'event_id', v_event.id);
  end if;

  -- Serializa também eventos diferentes destinados à mesma organização,
  -- inclusive antes de existir organization_subscriptions.
  perform 1
    from public.organizations o
   where o.id = p_organization_id
   for update;
  if not found then
    return jsonb_build_object('status', 'organization_not_found', 'event_id', v_event.id);
  end if;

  select s.* into v_before_subscription
    from public.organization_subscriptions s
   where s.organization_id = p_organization_id
   for update;
  v_has_subscription := found;

  v_before := jsonb_build_object(
    'event_outcome', v_event.outcome,
    'event_organization_id', v_event.organization_id,
    'subscription_plan_id', v_before_subscription.plan_id,
    'subscription_status', v_before_subscription.status,
    'subscription_last_billing_event_at', v_before_subscription.last_billing_event_at,
    'subscription_last_billing_installment', v_before_subscription.last_billing_installment
  );

  if v_has_subscription and v_before_subscription.last_billing_event_at is not null and (
    v_event.event_at < v_before_subscription.last_billing_event_at
    or (
      v_event.event_at = v_before_subscription.last_billing_event_at
      and coalesce(v_event.installment_number, 0)
        <= coalesce(v_before_subscription.last_billing_installment, 0)
    )
  ) then
    v_outcome := 'ignored_out_of_order';
  else
    insert into public.organization_subscriptions(
      organization_id, plan_id, status, billing_provider,
      external_subscription_id, last_sale_code, last_payment_at,
      paid_through, access_until, last_billing_event_at,
      last_billing_installment, updated_by
    ) values (
      p_organization_id, v_event.plan_id, v_event.target_status, 'monetizze',
      v_event.subscription_code, v_event.sale_code, v_event.payment_confirmed_at,
      v_event.paid_through, v_event.access_until, v_event.event_at,
      v_event.installment_number, null
    )
    on conflict (organization_id) do update set
      plan_id = excluded.plan_id,
      status = excluded.status,
      billing_provider = excluded.billing_provider,
      external_subscription_id = coalesce(
        excluded.external_subscription_id,
        public.organization_subscriptions.external_subscription_id
      ),
      last_sale_code = excluded.last_sale_code,
      last_payment_at = coalesce(
        excluded.last_payment_at,
        public.organization_subscriptions.last_payment_at
      ),
      paid_through = coalesce(excluded.paid_through, public.organization_subscriptions.paid_through),
      access_until = coalesce(excluded.access_until, public.organization_subscriptions.access_until),
      last_billing_event_at = excluded.last_billing_event_at,
      last_billing_installment = coalesce(
        excluded.last_billing_installment,
        public.organization_subscriptions.last_billing_installment
      ),
      updated_by = null;
    v_outcome := 'applied';
  end if;

  update public.billing_provider_events
     set organization_id = p_organization_id,
         outcome = v_outcome,
         error_code = null,
         processed_at = v_now
   where id = v_event.id;

  select s.* into v_after_subscription
    from public.organization_subscriptions s
   where s.organization_id = p_organization_id;

  v_after := jsonb_build_object(
    'event_outcome', v_outcome,
    'event_organization_id', p_organization_id,
    'subscription_plan_id', v_after_subscription.plan_id,
    'subscription_status', v_after_subscription.status,
    'subscription_last_billing_event_at', v_after_subscription.last_billing_event_at,
    'subscription_last_billing_installment', v_after_subscription.last_billing_installment
  );

  insert into public.api_audit_log(
    organization_id, actor_user_id, action, resource_type, resource_id,
    acting_as_platform_admin, bypassed_rls, metadata
  ) values (
    p_organization_id, p_actor_user_id, 'billing.event_linked',
    'billing_provider_event', v_event.id, true, true,
    jsonb_build_object(
      'reason', btrim(p_reason),
      'before', v_before,
      'after', v_after,
      'external', jsonb_build_object(
        'provider', v_event.provider,
        'webhook_id', v_event.webhook_id,
        'sale_code', v_event.sale_code,
        'sale_status', v_event.sale_status,
        'subscription_code', v_event.subscription_code,
        'event_at', v_event.event_at,
        'installment_number', v_event.installment_number
      )
    )
  );

  return jsonb_build_object(
    'status', case when v_outcome = 'applied' then 'linked' else v_outcome end,
    'event_id', v_event.id
  );
end;
$$;

comment on function public.fn_vincular_evento_monetizze(uuid, uuid, uuid, text) is
  'Vincula um pending_match à organização e projeta assinatura/auditoria na mesma transação. Usa somente os campos normalizados já persistidos no ledger.';

revoke execute on function public.fn_vincular_evento_monetizze(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.fn_vincular_evento_monetizze(uuid, uuid, uuid, text)
  to service_role;

notify pgrst, 'reload schema';
