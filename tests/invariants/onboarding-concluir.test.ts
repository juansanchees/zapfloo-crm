import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  db, fixture, channel, confirm, activate, agentState, versionState, expectInactive, auditCount,
} from "../db/onboarding-concluir-fixture";

describe("revisão confirmada e ativação restrita do onboarding", () => {
  it("ativa e promove o funcionário ensaiado quando a organização não tem principal", async () => {
    const f = await fixture();
    await confirm(f);
    const selected = await channel(f.org);
    const metadataBefore = (await db.query("select metadata from channel_sessions where id=$1", [selected])).rows[0].metadata;

    const receipt = await activate(f, selected);
    expect(receipt).toMatchObject({ agent_id: f.agent, version_id: f.version, channel_session_id: selected });
    expect(await agentState(f)).toEqual({ is_active: true, is_default: true, published_version_id: f.version });
    expect(await versionState(f)).toMatchObject({ status: "published", channel_session_id: selected });
    expect((await db.query("select metadata from channel_sessions where id=$1", [selected])).rows[0].metadata).toEqual(metadataBefore);
    expect((await db.query("select count(*)::int n from event_log where organization_id=$1", [f.org])).rows[0].n).toBe(0);
    expect(await activate(f, selected)).toEqual(receipt);
    expect(await auditCount(f, "onboarding.restricted_activation")).toBe(1);
  });

  it("default arquivado conserva a marca e não impede concluir a ativação", async () => {
    const f = await fixture();
    await confirm(f);
    const selected = await channel(f.org);
    const owner = randomUUID();
    await db.query(
      "insert into ai_agents(id,organization_id,name,system_prompt,model,kind,is_active,is_default,archived_at) values($1,$2,'Principal arquivado','Não reativar','qa-concluir','mcp_agent',false,true,now())",
      [owner, f.org],
    );

    await expect(activate(f, selected)).resolves.toMatchObject({ agent_id: f.agent, version_id: f.version });
    expect(await agentState(f)).toEqual({ is_active: true, is_default: false, published_version_id: f.version });
    expect((await db.query("select is_default,is_active,archived_at is not null archived from ai_agents where id=$1", [owner])).rows[0]).toEqual({ is_default: true, is_active: false, archived: true });
  });

  it("retry de recibo válido promove principal ausente sem republicar nem duplicar audit", async () => {
    const f = await fixture();
    await confirm(f);
    const selected = await channel(f.org);
    const receipt = await activate(f, selected);
    const versionBefore = await versionState(f);
    await db.query("update ai_agents set is_default=false where id=$1", [f.agent]);

    expect(await activate(f, selected)).toEqual(receipt);
    expect(await agentState(f)).toEqual({ is_active: true, is_default: true, published_version_id: f.version });
    expect(await versionState(f)).toEqual(versionBefore);
    expect(await auditCount(f, "onboarding.restricted_activation")).toBe(1);
  });

  it("default criado em concorrência vence a marca sem abortar a ativação bloqueada no índice único", async () => {
    const f = await fixture();
    await confirm(f);
    const selected = await channel(f.org);
    const owner = randomUUID();
    // A linha existe antes, mas a marca é criada por OUTRA transação ainda
    // não confirmada. INSERT seguraria também o FK da organização e testaria
    // um bloqueio anterior, não a disputa real no índice de defaults.
    await db.query(
      "insert into ai_agents(id,organization_id,name,system_prompt,model,kind,is_active,is_default) values($1,$2,'Principal concorrente','Preservar','qa-concluir','mcp_agent',true,false)",
      [owner, f.org],
    );
    const winner = await db.connect();
    const activator = await db.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await winner.query("begin");
      // Instrumentação adversarial SÓ neste escritor do banco descartável:
      // o audit trigger obteria um FK lock na organização e serializaria a
      // corrida ANTES da promoção. Replica desliga esses triggers incidentais,
      // mas NÃO o índice único. A sessão ativadora permanece inteiramente normal.
      // Sem capturar unique_violation, este mesmo teste deve falhar com 23505.
      await winner.query("set local session_replication_role=replica");
      await winner.query("update ai_agents set is_default=true where id=$1", [owner]);
      const winnerPid = (await winner.query("select pg_backend_pid() pid")).rows[0].pid as number;
      const activatorPid = (await activator.query("select pg_backend_pid() pid")).rows[0].pid as number;
      pending = activator.query("select fn_ativar_agente_teste_onboarding($1,$2,1,$3,$4,$5,true) r", [f.org, f.user, f.version, f.run, selected]);
      // Anexa um observador imediatamente para um mutante não virar rejection
      // não tratada. A asserção abaixo ainda exige a resolução original.
      void pending.catch(() => undefined);
      let observed: { wait_event: string; blockers: number[] } | undefined;
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        observed = (await db.query("select wait_event,pg_blocking_pids(pid) blockers from pg_stat_activity where pid=$1", [activatorPid])).rows[0];
        if (observed?.blockers.includes(winnerPid)) break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(observed).toEqual({ wait_event: "transactionid", blockers: [winnerPid] });
      await winner.query("commit");
      await expect(pending).resolves.toMatchObject({ rows: [{ r: { agent_id: f.agent, version_id: f.version } }] });
    } finally {
      await winner.query("rollback");
      await pending?.catch(() => undefined);
      winner.release();
      activator.release();
    }
    expect(await agentState(f)).toEqual({ is_active: true, is_default: false, published_version_id: f.version });
    expect((await db.query("select id from ai_agents where organization_id=$1 and is_default", [f.org])).rows).toEqual([{ id: owner }]);
    expect(await auditCount(f, "onboarding.restricted_activation")).toBe(1);
    await expect(activate(f, selected)).resolves.toMatchObject({ agent_id: f.agent, version_id: f.version });
  });

  it("confirmar exige revisão corrente, mantém tudo inativo e é idempotente", async () => {
    const unreviewed = await fixture({ reviewed: false });
    await expect(confirm(unreviewed)).rejects.toThrow("rehearsal_not_completed");
    await expectInactive(unreviewed);

    const f = await fixture();
    await expect(confirm(f)).resolves.toMatchObject({ agent_id: f.agent, version_id: f.version });
    await expect(confirm(f)).resolves.toMatchObject({ agent_id: f.agent, version_id: f.version });
    await expectInactive(f);
    expect(await auditCount(f, "onboarding.review_confirmed")).toBe(1);
    const state = (
      await db.query("select onboarding_state from organizations where id=$1", [f.org])
    ).rows[0].onboarding_state;
    expect(state.ai).toMatchObject({
      flow: "reviewed_draft_v2",
      revision: 1,
      agent_id: f.agent,
      version_id: f.version,
      run_id: f.run,
    });
  });

  it("publica exatamente a versão ensaiada só no canal escolhido e preserva default/outros canais", async () => {
    const f = await fixture();
    await confirm(f);
    const selected = await channel(f.org);
    const untouched = await channel(f.org, { mode: "open" });
    const defaultAgent = randomUUID();
    await db.query(
      "insert into ai_agents(id,organization_id,name,system_prompt,model,kind,is_active,is_default) values($1,$2,'Default existente','Prompt default existente','qa-concluir','mcp_agent',true,true)",
      [defaultAgent, f.org],
    );

    const receipt = await activate(f, selected);
    expect(receipt).toMatchObject({
      agent_id: f.agent,
      version_id: f.version,
      channel_session_id: selected,
    });
    expect(await agentState(f)).toEqual({
      is_active: true,
      is_default: false,
      published_version_id: f.version,
    });
    expect(await versionState(f)).toMatchObject({ status: "published", channel_session_id: selected });
    expect(
      (await db.query("select is_active,is_default,published_version_id from ai_agents where id=$1", [defaultAgent])).rows[0],
    ).toEqual({ is_active: true, is_default: true, published_version_id: null });
    expect(
      (await db.query("select metadata from channel_sessions where id=$1", [untouched])).rows[0].metadata,
    ).toMatchObject({ ai_gate: "open", transport: { preserved: true } });
    expect((await db.query("select count(*)::int n from event_log where organization_id=$1", [f.org])).rows[0].n).toBe(0);

    await expect(activate(f, selected)).resolves.toMatchObject({ version_id: f.version });
    expect(await auditCount(f, "onboarding.restricted_activation")).toBe(1);
    const saved = (
      await db.query("select onboarding_state from organizations where id=$1", [f.org])
    ).rows[0].onboarding_state;
    expect(saved.ai.restricted_activation).toMatchObject({
      draft_revision: 1,
      run_id: f.run,
      call_id: f.call,
      agent_id: f.agent,
      version_id: f.version,
      channel_session_id: selected,
      access_mode: "pre_go_live",
      test_phone_count: 1,
    });
    expect(saved.ai.restricted_activation.snapshot_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(saved)).not.toContain("+5511999998888");
    expect(JSON.stringify(saved)).not.toContain("Posso ajudar");
  });

  it.each([
    ["ausente", "missing"],
    ["desconectado", "stopped"],
    ["arquivado", "archived"],
    ["público aberto", "open"],
    ["lista vazia", "empty"],
    ["outra organização", "other_org"],
  ])("canal %s falha sem bind/publicação parcial", async (_label, kind) => {
    const f = await fixture();
    await confirm(f);
    const other = kind === "other_org" ? await fixture() : null;
    const channelId =
      kind === "missing"
        ? randomUUID()
        : await channel(other?.org ?? f.org, {
            status: kind === "stopped" ? "STOPPED" : "WORKING",
            archived: kind === "archived",
            mode: kind === "open" ? "open" : "pre_go_live",
            numbers: kind === "empty" ? [] : undefined,
          });
    await expect(activate(f, channelId)).rejects.toThrow(
      /activation_channel_unavailable|activation_channel_not_restricted/,
    );
    await expectInactive(f);
    expect(await auditCount(f, "onboarding.restricted_activation")).toBe(0);
  });

  it.each([
    ["metadata vazio", {}],
    ["ai_gate ausente", { ai_gate_mode: "pre_go_live", ai_test_phone_numbers: ["+5511999998888"] }],
    ["ai_gate nulo", { ai_gate: null, ai_gate_mode: "pre_go_live", ai_test_phone_numbers: ["+5511999998888"] }],
    ["modo ausente", { ai_gate: "allowlist", ai_test_phone_numbers: ["+5511999998888"] }],
    ["modo nulo", { ai_gate: "allowlist", ai_gate_mode: null, ai_test_phone_numbers: ["+5511999998888"] }],
    ["lista ausente", { ai_gate: "allowlist", ai_gate_mode: "pre_go_live" }],
    ["lista nula", { ai_gate: "allowlist", ai_gate_mode: "pre_go_live", ai_test_phone_numbers: null }],
    ["lista objeto", { ai_gate: "allowlist", ai_gate_mode: "pre_go_live", ai_test_phone_numbers: {} }],
    ["lista com null", { ai_gate: "allowlist", ai_gate_mode: "pre_go_live", ai_test_phone_numbers: [null] }],
    ["lista com número inválido", { ai_gate: "allowlist", ai_gate_mode: "pre_go_live", ai_test_phone_numbers: ["11999998888"] }],
  ])("canal com %s falha fechado sem ativação nem audit", async (_label, metadata) => {
    const f = await fixture();
    await confirm(f);
    const selected = await channel(f.org, { metadata });

    await expect(activate(f, selected)).rejects.toThrow("activation_channel_not_restricted");
    await expectInactive(f);
    expect(await auditCount(f, "onboarding.restricted_activation")).toBe(0);
  });

  it.each(["revoked", "suspended", "completed"])(
    "%s depois da confirmação retira a autoridade sem mutação parcial",
    async (state) => {
      const f = await fixture();
      await confirm(f);
      const selected = await channel(f.org);
      if (state === "revoked") {
        await db.query("update user_organizations set revoked_at=now() where organization_id=$1", [f.org]);
      } else if (state === "suspended") {
        await db.query("update organizations set suspended_at=now() where id=$1", [f.org]);
      } else {
        await db.query("update organizations set onboarded_at=now() where id=$1", [f.org]);
      }
      await expect(activate(f, selected)).rejects.toThrow(/draft_forbidden|draft_unavailable/);
      await expectInactive(f);
    },
  );

  it("run/revisão/versão antigos e edição posterior não autorizam ativação", async () => {
    for (const mutation of ["run", "revision", "version", "business", "configuration"] as const) {
      const f = await fixture();
      await confirm(f);
      const selected = await channel(f.org);
      if (mutation === "version") {
        await db.query("update ai_agent_versions set system_prompt='Prompt mudou depois da revisão' where id=$1", [f.version]);
      }
      if (mutation === "business") {
        await db.query("update organizations set display_name='Outro negócio' where id=$1", [f.org]);
      }
      if (mutation === "configuration") {
        await db.query("select fn_save_onboarding_draft($1,$2,1,$3)", [
          f.org,
          f.user,
          { name: "Outro agente", prompt_template: "support_minimal", regras_da_casa: "" },
        ]);
      }
      await expect(
        activate(f, selected, {
          run: mutation === "run" ? randomUUID() : f.run,
          revision: mutation === "revision" ? 2 : 1,
          version: mutation === "version" ? f.version : f.version,
        }),
      ).rejects.toThrow(/draft_conflict|draft_context_changed|activation_conflict/);
      await expectInactive(f);
    }
  });

  it("chave ausente ou credencial revogada falha sem publicação", async () => {
    const platform = await fixture();
    await confirm(platform);
    const platformChannel = await channel(platform.org);
    await expect(
      activate(platform, platformChannel, { installationKey: false }),
    ).rejects.toThrow("activation_credential_unavailable");
    await expectInactive(platform);

    const byok = await fixture({ credential: true });
    await confirm(byok);
    const byokChannel = await channel(byok.org);
    await db.query("update ai_provider_credentials set is_active=false where id=$1", [byok.credential]);
    // A revalidação canônica da 0223 vê a revogação antes da checagem
    // especializada da ativação; ambos os códigos são fail-closed.
    await expect(activate(byok, byokChannel)).rejects.toThrow("draft_credential_unavailable");
    await expectInactive(byok);
  });

  it("usa credencial válida da organização sem gravá-la na versão nem exigir chave da instalação", async () => {
    const f = await fixture({ credential: true, useCredentialInVersion: false });
    await confirm(f);
    const selected = await channel(f.org);

    await expect(
      activate(f, selected, { installationKey: false }),
    ).resolves.toMatchObject({ agent_id: f.agent, version_id: f.version });
    expect(
      (
        await db.query(
          "select credential_id from ai_agent_versions where id=$1 and organization_id=$2",
          [f.version, f.org],
        )
      ).rows[0].credential_id,
    ).toBeNull();
  });

  it("não substitui agente ativo já publicado no canal", async () => {
    const f = await fixture();
    await confirm(f);
    const selected = await channel(f.org);
    const otherAgent = randomUUID();
    const otherVersion = randomUUID();
    await db.query(
      "insert into ai_agents(id,organization_id,name,system_prompt,model,kind,is_active,is_default) values($1,$2,'Outro ativo','Prompt de outro agente','qa-concluir','mcp_agent',true,false)",
      [otherAgent, f.org],
    );
    await db.query(
      "insert into ai_agent_versions(id,organization_id,agent_id,version_number,system_prompt,provider,model,tool_ids,pipeline_ids,channel_session_id,status,published_at) values($1,$2,$3,1,'Prompt de outro agente','openai','qa-concluir','{}','{}',$4,'published',now())",
      [otherVersion, f.org, otherAgent, selected],
    );
    await db.query("update ai_agents set published_version_id=$1 where id=$2", [otherVersion, otherAgent]);

    await expect(activate(f, selected)).rejects.toThrow("activation_agent_conflict");
    await expectInactive(f);
    expect((await db.query("select published_version_id from ai_agents where id=$1", [otherAgent])).rows[0].published_version_id).toBe(otherVersion);
  });

  it("retry não sobrescreve alteração posterior nem duplica audit", async () => {
    const f = await fixture();
    await confirm(f);
    const selected = await channel(f.org);
    await activate(f, selected);
    await db.query("update channel_sessions set metadata='{}'::jsonb where id=$1", [selected]);
    await expect(activate(f, selected)).rejects.toThrow("activation_conflict");
    expect(await auditCount(f, "onboarding.restricted_activation")).toBe(1);
    await db.query(
      "update channel_sessions set metadata=jsonb_build_object('ai_gate','allowlist','ai_gate_mode','pre_go_live','ai_test_phone_numbers','{}'::jsonb) where id=$1",
      [selected],
    );
    await expect(activate(f, selected)).rejects.toThrow("activation_conflict");
    expect(await auditCount(f, "onboarding.restricted_activation")).toBe(1);
    await db.query(
      "update channel_sessions set metadata=jsonb_set(metadata,'{ai_test_phone_numbers}','[\"+5511999998888\"]'::jsonb) where id=$1",
      [selected],
    );
    await db.query("update ai_agents set is_active=false where id=$1", [f.agent]);
    await expect(activate(f, selected)).rejects.toThrow("activation_conflict");
    expect((await agentState(f)).is_active).toBe(false);
    expect(await auditCount(f, "onboarding.restricted_activation")).toBe(1);
  });

  it.each(["version_snapshot", "receipt_snapshot", "audit_snapshot"])(
    "retry detecta adulteração posterior em %s e não sobrescreve evidência",
    async (kind) => {
      const f = await fixture();
      await confirm(f);
      const selected = await channel(f.org);
      await activate(f, selected);

      if (kind === "version_snapshot") {
        await db.query("alter table ai_agent_versions disable trigger trg_ai_agent_versions_content_immutable");
        try {
          await db.query(
            "update ai_agent_versions set system_prompt='Prompt adulterado depois da publicação' where id=$1",
            [f.version],
          );
        } finally {
          await db.query("alter table ai_agent_versions enable trigger trg_ai_agent_versions_content_immutable");
        }
      } else if (kind === "receipt_snapshot") {
        await db.query(
          "update organizations set onboarding_state=jsonb_set(onboarding_state,'{ai,restricted_activation,snapshot_sha256}',to_jsonb($2::text)) where id=$1",
          [f.org, "b".repeat(64)],
        );
      } else {
        await db.query(
          "update api_audit_log set metadata=jsonb_set(metadata,'{snapshot_sha256}',to_jsonb($2::text)) where organization_id=$1 and action='onboarding.restricted_activation'",
          [f.org, "c".repeat(64)],
        );
      }

      await expect(activate(f, selected)).rejects.toThrow("activation_conflict");
      expect(await auditCount(f, "onboarding.restricted_activation")).toBe(1);
      if (kind === "version_snapshot") {
        expect(
          (await db.query("select system_prompt from ai_agent_versions where id=$1", [f.version])).rows[0]
            .system_prompt,
        ).toBe("Prompt adulterado depois da publicação");
      }
    },
  );

  it("duas ativações concorrentes convergem para o mesmo recibo e um audit", async () => {
    const f = await fixture();
    await confirm(f);
    const selected = await channel(f.org);

    const [first, second] = await Promise.all([
      activate(f, selected),
      activate(f, selected),
    ]);
    expect(first).toMatchObject({
      agent_id: f.agent,
      version_id: f.version,
      channel_session_id: selected,
    });
    expect(second).toEqual(first);
    expect(await agentState(f)).toEqual({ is_active: true, is_default: true, published_version_id: f.version });
    expect(await auditCount(f, "onboarding.restricted_activation")).toBe(1);
  });

  it("RPCs são service-only e isolam duas organizações", async () => {
    const f = await fixture();
    const other = await fixture();
    await confirm(f);
    const otherChannel = await channel(other.org);
    await expect(activate(f, otherChannel)).rejects.toThrow("activation_channel_unavailable");
    await expectInactive(f);
    await expectInactive(other);

    const signatures = [
      "fn_confirmar_agente_revisado_onboarding(uuid,uuid,integer,uuid,uuid)",
      "fn_ativar_agente_teste_onboarding(uuid,uuid,integer,uuid,uuid,uuid,boolean)",
    ];
    for (const signature of signatures) {
      const grants = (
        await db.query(
          "select has_function_privilege('anon',$1,'execute') anon, has_function_privilege('authenticated',$1,'execute') authenticated, has_function_privilege('service_role',$1,'execute') service_role",
          [signature],
        )
      ).rows[0];
      expect(grants).toEqual({ anon: false, authenticated: false, service_role: true });
    }
  });

  it("mutante real sem lista não vazia aceita indevidamente e rollback restaura recusa", async () => {
    const f = await fixture();
    await confirm(f);
    const selected = await channel(f.org, { numbers: [] });
    await expect(activate(f, selected)).rejects.toThrow("activation_channel_not_restricted");

    const client = await db.connect();
    try {
      await client.query("begin");
      const source = (
        await client.query(
          "select pg_get_functiondef('fn_ativar_agente_teste_onboarding(uuid,uuid,integer,uuid,uuid,uuid,boolean)'::regprocedure) source",
        )
      ).rows[0].source as string;
      const mutant = source.replace("or jsonb_array_length(v_numbers) = 0", "");
      expect(mutant).not.toBe(source);
      await client.query(mutant);
      await expect(
        client.query("select fn_ativar_agente_teste_onboarding($1,$2,1,$3,$4,$5,true)", [
          f.org,
          f.user,
          f.version,
          f.run,
          selected,
        ]),
      ).resolves.toBeDefined();
    } finally {
      await client.query("rollback");
      client.release();
    }
    await expect(activate(f, selected)).rejects.toThrow("activation_channel_not_restricted");
    await expectInactive(f);
  });
});
