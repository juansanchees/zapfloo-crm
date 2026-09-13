import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { db, fixture, channel, confirm, activate, agentState } from "../db/onboarding-concluir-fixture";

const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260913190100_0233_onboarding_reparar_funcionario_principal.sql"),
  "utf8",
);

async function legadoAtivado() {
  const f = await fixture();
  await confirm(f);
  const selected = await channel(f.org);
  await activate(f, selected);
  // Estado histórico da 1.18.0: recibo e publicação reais, onboarding já
  // concluído, mas a marca nunca foi gravada. Não inventamos o recibo à mão.
  await db.query("update ai_agents set is_default=false where id=$1", [f.agent]);
  await db.query("update organizations set onboarded_at=now() where id=$1", [f.org]);
  return { ...f, selected };
}

async function estadoPublicado(ids: string[]) {
  return (await db.query(
    "select a.id,a.organization_id,a.is_active,a.archived_at,a.published_version_id,v.status,v.channel_session_id,v.published_at,c.metadata from ai_agents a join ai_agent_versions v on v.id=a.published_version_id and v.organization_id=a.organization_id join channel_sessions c on c.id=v.channel_session_id and c.organization_id=a.organization_id where a.id=any($1::uuid[]) order by a.id",
    [ids],
  )).rows;
}

describe("correção conservadora do funcionário principal pelo recibo", () => {
  it("backfill promove só publicação evidenciada da própria organização, preserva restrição e declara quatro contagens idempotentes", async () => {
    const baseOrganizations = (await db.query("select count(*)::int n from organizations")).rows[0].n as number;
    expect(baseOrganizations).toBe(0);
    const valid = await legadoAtivado();
    const validAfterGoLive = await legadoAtivado();
    // Não reabre a lista nem exige que um cliente já lançado retorne ao teste.
    await db.query("update channel_sessions set metadata=jsonb_set(metadata,'{ai_gate}','\"open\"'::jsonb) - 'ai_gate_mode' - 'ai_test_phone_numbers' where id=$1", [validAfterGoLive.selected]);

    const existing = await legadoAtivado();
    const existingOwner = randomUUID();
    await db.query("insert into ai_agents(id,organization_id,name,system_prompt,model,kind,is_active,is_default) values($1,$2,'Principal anterior','Preservar','qa-concluir','mcp_agent',false,true)", [existingOwner, existing.org]);

    const archivedDefault = await legadoAtivado();
    await db.query("update ai_agents set is_default=true,is_active=false,archived_at=now() where id=$1", [archivedDefault.agent]);

    const noReceipt = await legadoAtivado();
    await db.query("update organizations set onboarding_state=onboarding_state #- '{ai,restricted_activation}' where id=$1", [noReceipt.org]);
    const foreignReceipt = await legadoAtivado();
    await db.query("update organizations set onboarding_state=jsonb_set(onboarding_state,'{ai,restricted_activation}',(select onboarding_state #> '{ai,restricted_activation}' from organizations where id=$2)) where id=$1", [foreignReceipt.org, valid.org]);

    const invalidUuid = await legadoAtivado();
    await db.query("update organizations set onboarding_state=jsonb_set(onboarding_state,'{ai,restricted_activation,agent_id}','\"não-é-uuid\"'::jsonb) where id=$1", [invalidUuid.org]);
    const invalidDate = await legadoAtivado();
    await db.query("update organizations set onboarding_state=jsonb_set(onboarding_state,'{ai,restricted_activation,activated_at}','\"2026-99-99T99:99:99Z\"'::jsonb) where id=$1", [invalidDate.org]);
    const mismatchedAudit = await legadoAtivado();
    await db.query("update organizations set onboarding_state=jsonb_set(onboarding_state,'{ai,restricted_activation,snapshot_sha256}',to_jsonb($2::text)) where id=$1", [mismatchedAudit.org, "a".repeat(64)]);
    const absentAudit = await legadoAtivado();
    // Mantém recibo + versão + snapshot íntegros. Só a evidência append-only
    // independente falta; remover o EXISTS da migration deve promover errado.
    await db.query("update api_audit_log set action='qa.receipt_without_activation_audit' where organization_id=$1 and action='onboarding.restricted_activation'", [absentAudit.org]);
    const stalePublication = await legadoAtivado();
    await db.query("update ai_agents set published_version_id=null where id=$1", [stalePublication.agent]);
    const archivedCandidate = await legadoAtivado();
    await db.query("update ai_agents set archived_at=now() where id=$1", [archivedCandidate.agent]);
    const inactiveCandidate = await legadoAtivado();
    await db.query("update ai_agents set is_active=false where id=$1", [inactiveCandidate.agent]);
    const suspendedOrganization = await legadoAtivado();
    await db.query("update organizations set suspended_at=now() where id=$1", [suspendedOrganization.org]);
    const unprepared = await fixture();

    const ignored = [noReceipt, foreignReceipt, invalidUuid, invalidDate, mismatchedAudit, absentAudit, stalePublication, archivedCandidate, inactiveCandidate, suspendedOrganization, unprepared];
    const all = [valid, validAfterGoLive, existing, archivedDefault, ...ignored];
    const before = await estadoPublicado(all.map((f) => f.agent));
    const countsBefore = (await db.query("select (select count(*) from api_audit_log)::int audit,(select count(*) from event_log)::int events")).rows[0];
    const client = await db.connect();
    const notices: string[] = [];
    const receiveNotice = (notice: { message?: string }) => {
      if (!notice.message) return;
      notices.push(notice.message);
      if (notice.message.startsWith("onboarding_funcionario_principal:")) process.stdout.write(`NOTICE: ${notice.message}\n`);
    };
    client.on("notice", receiveNotice);
    try {
      await client.query(migration);
      expect(notices.filter((n) => n.startsWith("onboarding_funcionario_principal:"))).toEqual([
        `onboarding_funcionario_principal: promovidas=2, ignoradas_por_default=2, ignoradas_por_falta_de_evidencia=${ignored.length}, defaults_arquivados=1`,
      ]);
      expect((await agentState(valid)).is_default).toBe(true);
      expect((await agentState(validAfterGoLive)).is_default).toBe(true);
      for (const f of [existing, ...ignored]) expect((await agentState(f)).is_default, f.org).toBe(false);
      expect((await db.query("select id from ai_agents where organization_id=$1 and is_default", [existing.org])).rows).toEqual([{ id: existingOwner }]);
      expect((await agentState(archivedDefault)).is_default).toBe(true);
      expect(await estadoPublicado(all.map((f) => f.agent))).toEqual(before);
      // O trigger canônico de ai_agents audita as duas promoções. Não há
      // execução de agente nem envio: event_log continua sem linhas novas.
      const countsAfter = { audit: countsBefore.audit + 2, events: countsBefore.events };
      expect((await db.query("select (select count(*) from api_audit_log)::int audit,(select count(*) from event_log)::int events")).rows[0]).toEqual(countsAfter);

      notices.length = 0;
      await client.query(migration);
      expect(notices.filter((n) => n.startsWith("onboarding_funcionario_principal:"))).toEqual([
        `onboarding_funcionario_principal: promovidas=0, ignoradas_por_default=4, ignoradas_por_falta_de_evidencia=${ignored.length}, defaults_arquivados=1`,
      ]);
      expect(await estadoPublicado(all.map((f) => f.agent))).toEqual(before);
      expect((await db.query("select count(*)::int n from ai_agents where is_default")).rows[0].n).toBe(4);
      expect((await db.query("select (select count(*) from api_audit_log)::int audit,(select count(*) from event_log)::int events")).rows[0]).toEqual(countsAfter);
    } finally {
      client.off("notice", receiveNotice);
      client.release();
    }
  });
});
