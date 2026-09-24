import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { GOV_ORG, lastLine, seedGov, sql } from "./gov-helpers";

const container = process.env.TEST_DB_CONTAINER;
if (!container) throw new Error("Rode por corepack pnpm test:db.");

function foiRecusado(script: string, trecho: string): boolean {
  try {
    sql(script);
    return false;
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? "";
    return stderr.includes(trecho);
  }
}

function processar(sobrescritas: {
  webhookId?: string;
  saleCode?: string;
  saleStatus?: string;
  eventAt?: string;
  installment?: number | null;
  targetStatus?: string | null;
  paymentConfirmedAt?: string | null;
  paidThrough?: string | null;
  accessUntil?: string | null;
} = {}) {
  const webhookId = sobrescritas.webhookId ?? "wh-schema-1";
  const saleCode = sobrescritas.saleCode ?? "sale-schema-1";
  const saleStatus = sobrescritas.saleStatus ?? "approved";
  const eventAt = sobrescritas.eventAt ?? "2026-09-24T12:00:00.000Z";
  const installment = sobrescritas.installment === undefined ? 1 : sobrescritas.installment;
  const targetStatus = sobrescritas.targetStatus === undefined ? "ativo" : sobrescritas.targetStatus;
  const paymentConfirmedAt = sobrescritas.paymentConfirmedAt === undefined
    ? "2026-09-24T12:00:00.000Z"
    : sobrescritas.paymentConfirmedAt;
  const paidThrough = sobrescritas.paidThrough === undefined
    ? "2026-10-24T12:00:00.000Z"
    : sobrescritas.paidThrough;
  const accessUntil = sobrescritas.accessUntil === undefined
    ? "2026-10-27T12:00:00.000Z"
    : sobrescritas.accessUntil;
  const literal = (value: string | null) => value === null ? "null" : `'${value}'`;

  const out = sql(`
    set role service_role;
    select public.fn_processar_evento_monetizze(
      p_webhook_id => '${webhookId}',
      p_sale_code => '${saleCode}',
      p_sale_status => '${saleStatus}',
      p_event_kind => 'subscription',
      p_event_at => '${eventAt}',
      p_installment_number => ${installment ?? "null"},
      p_product_code => 'product-schema',
      p_subscription_code => 'subscription-schema',
      p_buyer_email_hash => repeat('a', 64),
      p_buyer_email_masked => 'c***@example.test',
      p_organization_id => '${GOV_ORG}',
      p_plan_id => 'completo',
      p_target_status => ${literal(targetStatus)},
      p_payment_confirmed_at => ${literal(paymentConfirmedAt)},
      p_paid_through => ${literal(paidThrough)},
      p_access_until => ${literal(accessUntil)},
      p_outcome => 'applied',
      p_error_code => null
    );
  `);
  return JSON.parse(lastLine(out)) as { status: string; event_id?: string };
}

beforeEach(() => {
  seedGov();
  sql(`
    truncate table public.billing_provider_events;
    update public.platform_billing_settings
       set enforcement_enabled = false, updated_by = null;
    update public.organization_subscriptions
       set plan_id = 'completo', status = 'teste', updated_by = null,
           billing_provider = null, external_subscription_id = null,
           last_sale_code = null, last_payment_at = null, paid_through = null,
           access_until = null, last_billing_event_at = null,
           last_billing_installment = null
     where organization_id = '${GOV_ORG}';
  `);
});

describe("0239 — cobrança Monetizze nasce fechada e idempotente", () => {
  it("aceita os cinco estados comerciais e rejeita vocabulário desconhecido", () => {
    for (const status of ["teste", "ativo", "recusado", "cancelado", "pausado"]) {
      sql(`update public.organization_subscriptions set status = '${status}' where organization_id = '${GOV_ORG}';`);
      expect(sql(`select status from public.organization_subscriptions where organization_id = '${GOV_ORG}'`)).toBe(status);
    }

    expect(foiRecusado(
      `update public.organization_subscriptions set status = 'invalido' where organization_id = '${GOV_ORG}';`,
      "organization_subscriptions_status_check",
    )).toBe(true);
  });

  it("cria singleton de rollout desligado e não o liga ao reaplicar", () => {
    expect(sql(`
      select pg_get_expr(adbin, adrelid)
        from pg_attrdef
       where adrelid = 'public.platform_billing_settings'::regclass
         and adnum = (
           select attnum from pg_attribute
            where attrelid = 'public.platform_billing_settings'::regclass
              and attname = 'enforcement_enabled'
         )
    `)).toBe("false");
    expect(sql(`select count(*) || ':' || bool_and(not enforcement_enabled) from public.platform_billing_settings`))
      .toBe("1:true");

    const baseline = readFileSync(join(process.cwd(), "supabase", "baseline.sql"), "utf8");
    execFileSync(
      "docker",
      ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-f", "-"],
      { input: baseline, encoding: "utf8" },
    );
    expect(sql(`select count(*) || ':' || bool_and(not enforcement_enabled) from public.platform_billing_settings`))
      .toBe("1:true");
  });

  it("não expõe configuração nem ledger a anon/authenticated", () => {
    for (const table of ["platform_billing_settings", "billing_provider_events"]) {
      for (const role of ["anon", "authenticated"]) {
        for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
          expect(sql(`select has_table_privilege('${role}', 'public.${table}', '${privilege}')`),
            `${role} não pode ${privilege} em ${table}`).toBe("f");
        }
      }
      expect(sql(`select has_table_privilege('service_role', 'public.${table}', 'SELECT,INSERT,UPDATE,DELETE')`))
        .toBe("t");
      expect(sql(`select relrowsecurity from pg_class where oid = 'public.${table}'::regclass`)).toBe("t");
    }
  });

  it("reivindica e projeta um evento como service_role, com audit em UUID e IDs externos no metadata", () => {
    expect(processar()).toMatchObject({ status: "applied" });
    expect(sql(`
      select status || ':' || plan_id || ':' || billing_provider || ':' ||
             external_subscription_id || ':' || last_sale_code
        from public.organization_subscriptions where organization_id = '${GOV_ORG}'
    `)).toBe("ativo:completo:monetizze:subscription-schema:sale-schema-1");
    expect(sql(`
      select (paid_through = '2026-10-24T12:00:00.000Z'::timestamptz)::text || ':' ||
             (access_until = '2026-10-27T12:00:00.000Z'::timestamptz)::text
        from public.organization_subscriptions where organization_id = '${GOV_ORG}'
    `)).toBe("true:true");
    expect(sql(`
      select resource_id::text || ':' || (metadata->>'sale_code') || ':' || (metadata->>'webhook_id')
        from public.api_audit_log
       where action = 'billing.subscription_updated' and organization_id = '${GOV_ORG}'
       order by created_at desc limit 1
    `)).toBe(`${GOV_ORG}:sale-schema-1:wh-schema-1`);
  });

  it("deduplica tanto webhook_id quanto o par sale_code/sale_status", () => {
    expect(processar()).toMatchObject({ status: "applied" });
    expect(processar({ saleCode: "outra-venda", saleStatus: "blocked" })).toMatchObject({ status: "duplicate" });
    expect(processar({ webhookId: "outro-webhook" })).toMatchObject({ status: "duplicate" });
    expect(Number(sql(`select count(*) from public.billing_provider_events`))).toBe(1);

    expect(foiRecusado(`
      insert into public.billing_provider_events
        (webhook_id, sale_code, sale_status, event_kind, event_at, product_code, outcome)
      values ('wh-schema-1', 'sale-unique-webhook', 'novo', 'sale', now(), 'product-schema', 'pending_match');
    `, "billing_provider_events_webhook_id_key")).toBe(true);
    expect(foiRecusado(`
      insert into public.billing_provider_events
        (webhook_id, sale_code, sale_status, event_kind, event_at, product_code, outcome)
      values ('wh-unique-pair', 'sale-schema-1', 'approved', 'sale', now(), 'product-schema', 'pending_match');
    `, "billing_provider_events_sale_status_key")).toBe(true);
  });

  it("ignora evento fora de ordem sem regredir a projeção", () => {
    expect(processar()).toMatchObject({ status: "applied" });
    expect(processar({
      webhookId: "wh-schema-old",
      saleStatus: "cancelled",
      eventAt: "2026-09-23T12:00:00.000Z",
      targetStatus: "cancelado",
      paymentConfirmedAt: null,
      paidThrough: null,
      accessUntil: null,
    })).toMatchObject({ status: "ignored_out_of_order" });
    expect(sql(`select status from public.organization_subscriptions where organization_id = '${GOV_ORG}'`)).toBe("ativo");
    expect(sql(`select outcome from public.billing_provider_events where webhook_id = 'wh-schema-old'`))
      .toBe("ignored_out_of_order");
  });

  it("revoga a RPC de public/anon/authenticated e a concede somente ao servidor", () => {
    const signature = `public.fn_processar_evento_monetizze(text,text,text,text,timestamp with time zone,integer,text,text,text,text,uuid,text,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,text,text)`;
    expect(sql(`select has_function_privilege('public', '${signature}', 'EXECUTE')`)).toBe("f");
    expect(sql(`select has_function_privilege('anon', '${signature}', 'EXECUTE')`)).toBe("f");
    expect(sql(`select has_function_privilege('authenticated', '${signature}', 'EXECUTE')`)).toBe("f");
    expect(sql(`select has_function_privilege('service_role', '${signature}', 'EXECUTE')`)).toBe("t");
  });

  it("não cria coluna para payload bruto nem altera a assinatura anterior ao reaplicar", () => {
    expect(sql(`
      select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'billing_provider_events'
         and column_name in ('raw_body', 'raw_payload', 'payload')
    `)).toBe("0");

    sql(`
      update public.organization_subscriptions
         set plan_id = 'basico', status = 'pausado'
       where organization_id = '${GOV_ORG}';
    `);
    const antes = sql(`select row_to_json(s)::text from public.organization_subscriptions s where organization_id = '${GOV_ORG}'`);
    const baseline = readFileSync(join(process.cwd(), "supabase", "baseline.sql"), "utf8");
    execFileSync(
      "docker",
      ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-f", "-"],
      { input: baseline, encoding: "utf8" },
    );
    const depois = sql(`select row_to_json(s)::text from public.organization_subscriptions s where organization_id = '${GOV_ORG}'`);
    expect(depois).toBe(antes);
  });
});
