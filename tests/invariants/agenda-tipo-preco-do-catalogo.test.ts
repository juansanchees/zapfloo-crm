import { describe, expect, it } from "vitest";

import { lastLine, sql } from "./gov-helpers";

describe("0237 · preço do tipo vem do catálogo da mesma organização", () => {
  it("aceita tipo sem produto e recusa produto de outro tenant", () => {
    const ids = lastLine(sql(`
      insert into public.organizations (slug, display_name, legal_name, status)
      values ('preco-agenda-a', 'A', 'A', 'active'), ('preco-agenda-b', 'B', 'B', 'active')
      on conflict (slug) do update set display_name=excluded.display_name;
      with orgs as (
        select id, slug from public.organizations where slug in ('preco-agenda-a','preco-agenda-b')
      ), produto as (
        insert into public.catalog_products (organization_id,codigo,nome,preco_cents)
        select id, 'CONSULTA', 'Consulta', 18000 from orgs where slug='preco-agenda-b'
        on conflict (organization_id,codigo) do update set preco_cents=excluded.preco_cents
        returning id, organization_id
      )
      select (select id from orgs where slug='preco-agenda-a')::text || '|' ||
             (select id from produto)::text;
    `));
    const [orgA, produtoB] = ids.split("|");

    sql(`
      insert into public.calendar_event_types
        (organization_id,name,slug,duration_minutes,location_kind,catalog_product_id)
      values ('${orgA}'::uuid,'Sem preço','sem-preco-0237',30,'in_person',null)
      on conflict (organization_id,slug) do update set catalog_product_id=null
    `);
    const semProduto = lastLine(sql(`
      select catalog_product_id is null
        from public.calendar_event_types
       where organization_id='${orgA}'::uuid and slug='sem-preco-0237';
    `));
    expect(semProduto).toBe("t");

    expect(() => sql(`
      update public.calendar_event_types
         set catalog_product_id='${produtoB}'::uuid
       where organization_id='${orgA}'::uuid and slug='sem-preco-0237';
    `)).toThrow();
  });
});
