-- 0237 · o preço do atendimento tem uma fonte: o catálogo
--
-- O vínculo é opcional: instalações que só usam duração/agenda não ganham uma
-- obrigação nova. A FK é composta pela organização para que nem um UUID de
-- produto conhecido permita ligar um tipo ao catálogo de outro tenant.

alter table public.calendar_event_types
  add column if not exists catalog_product_id uuid;

create unique index if not exists catalog_products_org_id_key
  on public.catalog_products (organization_id, id);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.calendar_event_types'::regclass
       and conname = 'calendar_event_types_catalog_product_org_fkey'
  ) then
    alter table public.calendar_event_types
      add constraint calendar_event_types_catalog_product_org_fkey
      foreign key (organization_id, catalog_product_id)
      references public.catalog_products (organization_id, id)
      on delete restrict;
  end if;
end
$$;

create index if not exists calendar_event_types_catalog_product_idx
  on public.calendar_event_types (organization_id, catalog_product_id)
  where catalog_product_id is not null;

comment on column public.calendar_event_types.catalog_product_id is
  'Produto opcional que é a fonte única de preço deste atendimento. A FK composta impede vínculo entre organizações; NULL mantém tipos sem preço válidos.';

notify pgrst, 'reload schema';
