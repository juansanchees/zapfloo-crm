import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { GOV_ADMIN, GOV_ORG, lastLine, seedGov, sql } from "./gov-helpers";

const containerFromEnv = process.env.TEST_DB_CONTAINER;
if (!containerFromEnv) throw new Error("Rode por corepack pnpm test:db.");
const container: string = containerFromEnv;

function foiRecusado(script: string, trecho: string): boolean {
  try {
    sql(script);
    return false;
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? "";
    return stderr.includes(trecho);
  }
}

type ProcessoSql = {
  concluido: Promise<{ code: number | null; stdout: string; stderr: string }>;
  resultado: { code: number | null; stdout: string; stderr: string } | null;
};

function sqlAssincrono(script: string, applicationName: string): ProcessoSql {
  let resolver!: (resultado: { code: number | null; stdout: string; stderr: string }) => void;
  const concluido = new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    resolver = resolve;
  });
  const processo: ProcessoSql = { resultado: null, concluido };
  execFile("docker", [
    "exec", "-e", `PGAPPNAME=${applicationName}`, container,
    "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atqc", script,
  ], { encoding: "utf8" }, (error, stdout, stderr) => {
    const code = error && "code" in error && typeof error.code === "number" ? error.code : error ? 1 : 0;
    processo.resultado = { code, stdout, stderr };
    resolver(processo.resultado);
  });
  return processo;
}

async function esperarAtividade(applicationName: string, predicadoSql: string, processo?: ProcessoSql) {
  const limite = Date.now() + 5_000;
  while (Date.now() < limite) {
    if (processo?.resultado) return false;
    const encontrou = sql(`
      select exists(
        select 1 from pg_stat_activity
         where application_name = '${applicationName}' and (${predicadoSql})
      )
    `);
    if (encontrou === "t") return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
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
  buyerEmailMasked?: string | null;
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
  const buyerEmailMasked = sobrescritas.buyerEmailMasked === undefined
    ? "c***@example.test"
    : sobrescritas.buyerEmailMasked;
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
      p_buyer_email_masked => ${literal(buyerEmailMasked)},
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

function criarEventoPendente(sobrescritas: {
  webhookId?: string;
  saleCode?: string;
  saleStatus?: string;
  eventAt?: string;
  installment?: number | null;
  planId?: string | null;
  targetStatus?: string | null;
} = {}) {
  const literal = (value: string | null) => value === null ? "null" : `'${value}'`;
  const out = sql(`
    insert into public.billing_provider_events(
      webhook_id, sale_code, sale_status, event_kind, event_at,
      installment_number, product_code, subscription_code,
      buyer_email_hash, buyer_email_masked, plan_id, target_status,
      payment_confirmed_at, paid_through, access_until, outcome
    ) values (
      '${sobrescritas.webhookId ?? "wh-link-1"}',
      '${sobrescritas.saleCode ?? "sale-link-1"}',
      '${sobrescritas.saleStatus ?? "approved"}',
      'subscription', '${sobrescritas.eventAt ?? "2026-09-24T12:00:00Z"}',
      ${sobrescritas.installment === null ? "null" : sobrescritas.installment ?? 1},
      'product-schema', 'subscription-link', repeat('c', 64), 'c***@example.test',
      ${literal(sobrescritas.planId === undefined ? "completo" : sobrescritas.planId)},
      ${literal(sobrescritas.targetStatus === undefined ? "ativo" : sobrescritas.targetStatus)},
      '2026-09-24T12:00:00Z', '2026-10-24T12:00:00Z', '2026-10-27T12:00:00Z',
      'pending_match'
    ) returning id;
  `);
  const eventId = out.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)?.[0];
  if (!eventId) throw new Error(`insert não devolveu UUID: ${out}`);
  return eventId;
}

function vincular(eventId: string, organizationId = GOV_ORG) {
  const out = sql(`
    set role service_role;
    select public.fn_vincular_evento_monetizze(
      p_event_id => '${eventId}',
      p_organization_id => '${organizationId}',
      p_actor_user_id => '${GOV_ADMIN}',
      p_reason => 'Conciliação manual do teste'
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
    expect(sql(`
      select col_description('public.organization_subscriptions'::regclass, a.attnum)
        from pg_attribute a
       where a.attrelid = 'public.organization_subscriptions'::regclass and a.attname = 'status'
    `)).toContain("pausado bloqueia o produto mesmo com enforcement_enabled desligado");
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

  it("aceita local mascarado e recusa e-mail aberto no ledger", () => {
    expect(processar({ buyerEmailMasked: "c***@example.test" })).toMatchObject({ status: "applied" });
    expect(foiRecusado(`
      insert into public.billing_provider_events
        (webhook_id, sale_code, sale_status, event_kind, event_at, product_code,
         buyer_email_hash, buyer_email_masked, outcome)
      values
        ('wh-email-aberto', 'sale-email-aberto', 'approved', 'sale', now(), 'product-schema',
         repeat('b', 64), 'cliente@example.com', 'pending_match');
    `, "billing_provider_events_email_masked_check")).toBe(true);
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

  it("serializa duas primeiras assinaturas concorrentes e mantém o evento mais novo", async () => {
    sql(`
      delete from public.organization_subscriptions where organization_id = '${GOV_ORG}';
      create table if not exists public.billing_test_barrier (released boolean not null);
      truncate table public.billing_test_barrier;
      insert into public.billing_test_barrier(released) values (false);
      create or replace function public.fn_billing_test_pause_old()
      returns trigger language plpgsql set search_path = '' as $test$
      begin
        if new.last_sale_code = 'sale-race-old' then
          while not (select b.released from public.billing_test_barrier b limit 1) loop
            perform pg_sleep(0.02);
          end loop;
        end if;
        return new;
      end;
      $test$;
      drop trigger if exists trg_billing_test_pause_old on public.organization_subscriptions;
      create trigger trg_billing_test_pause_old
      before insert on public.organization_subscriptions
      for each row execute function public.fn_billing_test_pause_old();
    `);

    const chamada = (webhookId: string, saleCode: string, saleStatus: string, eventAt: string) => `
      set role service_role;
      select public.fn_processar_evento_monetizze(
        '${webhookId}', '${saleCode}', '${saleStatus}', 'subscription', '${eventAt}', 1,
        'product-schema', 'subscription-schema', repeat('a', 64), 'c***@example.test',
        '${GOV_ORG}', 'completo', 'ativo', '${eventAt}', '2026-10-24T12:00:00Z',
        '2026-10-27T12:00:00Z', 'applied', null
      );
    `;

    let antigo: ProcessoSql | null = null;
    let novo: ProcessoSql | null = null;
    try {
      antigo = sqlAssincrono(
        chamada("wh-race-old", "sale-race-old", "approved-old", "2026-09-24T11:00:00Z"),
        "monetizze-race-old",
      );
      expect(await esperarAtividade(
        "monetizze-race-old",
        "wait_event_type = 'Timeout' and wait_event = 'PgSleep'",
        antigo,
      ), "o evento antigo chegou à barreira depois de ler a ausência da assinatura").toBe(true);

      novo = sqlAssincrono(
        chamada("wh-race-new", "sale-race-new", "approved-new", "2026-09-24T12:00:00Z"),
        "monetizze-race-new",
      );
      expect(await esperarAtividade(
        "monetizze-race-new",
        "wait_event_type = 'Lock'",
        novo,
      ), "o evento novo esperou o lock da organização em vez de projetar em paralelo").toBe(true);

      sql(`update public.billing_test_barrier set released = true;`);
      const [resultadoAntigo, resultadoNovo] = await Promise.all([antigo.concluido, novo.concluido]);
      expect(resultadoAntigo, resultadoAntigo.stderr).toMatchObject({ code: 0 });
      expect(resultadoNovo, resultadoNovo.stderr).toMatchObject({ code: 0 });
      expect(sql(`
        select count(*) || ':' || last_sale_code || ':' || last_billing_event_at
          from public.organization_subscriptions
         where organization_id = '${GOV_ORG}'
         group by last_sale_code, last_billing_event_at
      `)).toBe("1:sale-race-new:2026-09-24 12:00:00+00");
    } finally {
      sql(`update public.billing_test_barrier set released = true;`);
      if (antigo && !antigo.resultado) await antigo.concluido;
      if (novo && !novo.resultado) await novo.concluido;
      sql(`
        drop trigger if exists trg_billing_test_pause_old on public.organization_subscriptions;
        drop function if exists public.fn_billing_test_pause_old();
        drop table if exists public.billing_test_barrier;
      `);
    }
  }, 15_000);

  it("vincula pendência existente, projeta os campos normalizados e audita before/after uma vez", () => {
    const eventId = criarEventoPendente();
    expect(vincular(eventId)).toMatchObject({ status: "linked", event_id: eventId });
    expect(sql(`
      select outcome || ':' || organization_id || ':' || (processed_at is not null)::text
        from public.billing_provider_events where id = '${eventId}'
    `)).toBe(`applied:${GOV_ORG}:true`);
    expect(sql(`
      select plan_id || ':' || status || ':' || last_sale_code || ':' || external_subscription_id
        from public.organization_subscriptions where organization_id = '${GOV_ORG}'
    `)).toBe("completo:ativo:sale-link-1:subscription-link");
    expect(sql(`
      select actor_user_id || ':' || resource_id || ':' ||
             (metadata->'before'->>'event_outcome') || ':' ||
             (metadata->'after'->>'event_outcome') || ':' ||
             (metadata->'external'->>'sale_code') || ':' ||
             (metadata->>'reason')
        from public.api_audit_log
       where action = 'billing.event_linked' and resource_id = '${eventId}'
    `)).toBe(`${GOV_ADMIN}:${eventId}:pending_match:applied:sale-link-1:Conciliação manual do teste`);

    expect(vincular(eventId)).toMatchObject({ status: "already_linked", event_id: eventId });
    expect(sql(`select count(*) from public.api_audit_log where action = 'billing.event_linked' and resource_id = '${eventId}'`))
      .toBe("1");
  });

  it("vínculo recusa ausente/não pendente e preserva monotonicidade de assinatura mais nova", () => {
    expect(vincular("ffffffff-ffff-4fff-8fff-ffffffffffff")).toMatchObject({ status: "not_found" });

    const naoPendente = criarEventoPendente({ webhookId: "wh-link-ignored", saleCode: "sale-link-ignored" });
    sql(`update public.billing_provider_events set outcome = 'ignored_event', processed_at = now() where id = '${naoPendente}';`);
    expect(vincular(naoPendente)).toMatchObject({ status: "not_pending", event_id: naoPendente });

    sql(`
      update public.organization_subscriptions
         set plan_id = 'basico', status = 'ativo', last_sale_code = 'sale-current-newer',
             last_billing_event_at = '2026-09-25T12:00:00Z', last_billing_installment = 2
       where organization_id = '${GOV_ORG}';
    `);
    const antigo = criarEventoPendente({
      webhookId: "wh-link-old", saleCode: "sale-link-old", saleStatus: "cancelled",
      eventAt: "2026-09-24T12:00:00Z", installment: 1, planId: "completo", targetStatus: "cancelado",
    });
    expect(vincular(antigo)).toMatchObject({ status: "ignored_out_of_order", event_id: antigo });
    expect(sql(`select plan_id || ':' || status || ':' || last_sale_code from public.organization_subscriptions where organization_id = '${GOV_ORG}'`))
      .toBe("basico:ativo:sale-current-newer");
    expect(sql(`select outcome || ':' || organization_id from public.billing_provider_events where id = '${antigo}'`))
      .toBe(`ignored_out_of_order:${GOV_ORG}`);
  });

  it("claim do vínculo é concorrente, idempotente e produz uma única projeção/auditoria", async () => {
    sql(`delete from public.organization_subscriptions where organization_id = '${GOV_ORG}';`);
    const eventId = criarEventoPendente({ webhookId: "wh-link-race", saleCode: "sale-link-race" });
    sql(`
      create table if not exists public.billing_link_test_barrier (released boolean not null);
      truncate table public.billing_link_test_barrier;
      insert into public.billing_link_test_barrier(released) values (false);
      create or replace function public.fn_billing_link_test_pause_first()
      returns trigger language plpgsql set search_path = '' as $test$
      begin
        if new.last_sale_code = 'sale-link-race' then
          while not (select b.released from public.billing_link_test_barrier b limit 1) loop
            perform pg_sleep(0.02);
          end loop;
        end if;
        return new;
      end;
      $test$;
      drop trigger if exists trg_billing_link_test_pause_first on public.organization_subscriptions;
      create trigger trg_billing_link_test_pause_first
      before insert on public.organization_subscriptions
      for each row execute function public.fn_billing_link_test_pause_first();
    `);
    const chamada = `
      set role service_role;
      select public.fn_vincular_evento_monetizze(
        '${eventId}', '${GOV_ORG}', '${GOV_ADMIN}', 'Conciliação concorrente do teste'
      );
    `;
    let primeiro: ProcessoSql | null = null;
    let segundo: ProcessoSql | null = null;
    try {
      primeiro = sqlAssincrono(chamada, "monetizze-link-first");
      expect(await esperarAtividade(
        "monetizze-link-first", "wait_event_type = 'Timeout' and wait_event = 'PgSleep'", primeiro,
      )).toBe(true);
      segundo = sqlAssincrono(chamada, "monetizze-link-second");
      expect(await esperarAtividade("monetizze-link-second", "wait_event_type = 'Lock'", segundo)).toBe(true);

      sql(`update public.billing_link_test_barrier set released = true;`);
      const [r1, r2] = await Promise.all([primeiro.concluido, segundo.concluido]);
      expect(r1, r1.stderr).toMatchObject({ code: 0 });
      expect(r2, r2.stderr).toMatchObject({ code: 0 });
      const status = [
        JSON.parse(lastLine(r1.stdout.trim())).status,
        JSON.parse(lastLine(r2.stdout.trim())).status,
      ].sort();
      expect(status).toEqual(["already_linked", "linked"]);
      expect(sql(`select outcome || ':' || organization_id from public.billing_provider_events where id = '${eventId}'`))
        .toBe(`applied:${GOV_ORG}`);
      expect(sql(`select count(*) from public.organization_subscriptions where organization_id = '${GOV_ORG}'`)).toBe("1");
      expect(sql(`select count(*) from public.api_audit_log where action = 'billing.event_linked' and resource_id = '${eventId}'`))
        .toBe("1");
    } finally {
      sql(`update public.billing_link_test_barrier set released = true;`);
      if (primeiro && !primeiro.resultado) await primeiro.concluido;
      if (segundo && !segundo.resultado) await segundo.concluido;
      sql(`
        drop trigger if exists trg_billing_link_test_pause_first on public.organization_subscriptions;
        drop function if exists public.fn_billing_link_test_pause_first();
        drop table if exists public.billing_link_test_barrier;
        insert into public.organization_subscriptions(organization_id, plan_id, status)
        values ('${GOV_ORG}', 'completo', 'ativo')
        on conflict (organization_id) do nothing;
      `);
    }
  }, 15_000);

  it("revoga a RPC de public/anon/authenticated e a concede somente ao servidor", () => {
    const signature = `public.fn_processar_evento_monetizze(text,text,text,text,timestamp with time zone,integer,text,text,text,text,uuid,text,text,timestamp with time zone,timestamp with time zone,timestamp with time zone,text,text)`;
    expect(sql(`select has_function_privilege('public', '${signature}', 'EXECUTE')`)).toBe("f");
    expect(sql(`select has_function_privilege('anon', '${signature}', 'EXECUTE')`)).toBe("f");
    expect(sql(`select has_function_privilege('authenticated', '${signature}', 'EXECUTE')`)).toBe("f");
    expect(sql(`select has_function_privilege('service_role', '${signature}', 'EXECUTE')`)).toBe("t");

    const vincularSignature = "public.fn_vincular_evento_monetizze(uuid,uuid,uuid,text)";
    expect(sql(`select has_function_privilege('public', '${vincularSignature}', 'EXECUTE')`)).toBe("f");
    expect(sql(`select has_function_privilege('anon', '${vincularSignature}', 'EXECUTE')`)).toBe("f");
    expect(sql(`select has_function_privilege('authenticated', '${vincularSignature}', 'EXECUTE')`)).toBe("f");
    expect(sql(`select has_function_privilege('service_role', '${vincularSignature}', 'EXECUTE')`)).toBe("t");
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
