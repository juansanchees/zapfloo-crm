import { randomUUID } from "node:crypto";
import { afterAll, expect } from "vitest";
import pg from "pg";

if (!process.env.TEST_DB_CONTAINER) throw new Error("Execute via pnpm test:db.");
export const db = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${process.env.TEST_DB_PORT ?? "54329"}/postgres`,
  max: 4,
});
afterAll(async () => {
  await db.end();
});

export type Fixture = Awaited<ReturnType<typeof fixture>>;

export async function fixture(
  options: { reviewed?: boolean; credential?: boolean; useCredentialInVersion?: boolean } = {},
) {
  const org = randomUUID();
  const user = randomUUID();
  const credential = options.credential ? randomUUID() : null;
  await db.query("insert into auth.users(id,email) values($1,$2)", [user, `${user}@example.test`]);
  await db.query(
    "insert into organizations(id,slug,legal_name,display_name) values($1,$2,'Negócio QA','Negócio QA')",
    [org, org],
  );
  await db.query(
    "insert into user_organizations(user_id,organization_id,role,accepted_at) values($1,$2,'admin',now())",
    [user, org],
  );
  await db.query(
    "insert into ai_models(provider,model_id,display_name,supports_tools) values('openai','qa-concluir','QA concluir',true) on conflict(provider,model_id) do nothing",
  );
  if (credential) {
    await db.query(
      "insert into ai_provider_credentials(id,organization_id,provider,label,api_key_encrypted,api_key_iv,api_key_tag,api_key_last4,validated_at) values($1,$2,'openai','QA','sintetico','iv','tag','0000',now())",
      [credential, org],
    );
  }
  await db.query("select fn_save_onboarding_draft($1,$2,0,$3)", [
    org,
    user,
    { name: "Atendente QA", prompt_template: "support_minimal", regras_da_casa: "Sem descontos" },
  ]);
  const prepared = (
    await db.query("select fn_prepare_onboarding_draft($1,$2,1,null,$3,$4) r", [
      org,
      user,
      { display_name: "Negócio QA", o_que_faz: null },
      {
        system_prompt: "Atenda com cuidado, clareza e sem descontos.",
        provider: "openai",
        model: "qa-concluir",
        credential_id: options.useCredentialInVersion === false ? null : credential,
        tool_ids: [],
      },
    ])
  ).rows[0].r;
  const run = (
    await db.query("select fn_iniciar_ensaio_onboarding($1,$2,1,$3,$4) r", [
      org,
      user,
      prepared.version_id,
      "Olá, como funciona?",
    ])
  ).rows[0].r;
  const call = randomUUID();
  await db.query(
    "insert into llm_calls(id,organization_id,agent_id,purpose,provider,model,status,input_tokens,output_tokens,latency_ms) values($1,$2,$3,'onboarding_rehearsal','openai','qa-concluir','ok',10,10,1)",
    [call, org, prepared.agent_id],
  );
  const proof = (await db.query(
    "select c.created_at::text called_at,d.rehearsal->>'started_at' started_at,c.created_at >= (d.rehearsal->>'started_at')::timestamptz ordered from llm_calls c join onboarding_drafts d on d.organization_id=c.organization_id where c.id=$1",
    [call],
  )).rows[0];
  expect(proof.ordered, JSON.stringify(proof)).toBe(true);
  await db.query("select fn_finalizar_ensaio_onboarding($1,$2,1,$3,$4,$5,$6,null)", [
    org,
    user,
    prepared.version_id,
    run.run_id,
    "Olá! Posso ajudar com segurança.",
    call,
  ]);
  if (options.reviewed !== false) {
    await db.query("select fn_revisar_ensaio_onboarding($1,$2,1,$3,$4)", [
      org,
      user,
      prepared.version_id,
      run.run_id,
    ]);
  }
  return {
    org,
    user,
    agent: prepared.agent_id as string,
    version: prepared.version_id as string,
    run: run.run_id as string,
    call,
    credential,
  };
}

export async function channel(
  org: string,
  options: {
    status?: string;
    archived?: boolean;
    mode?: "open" | "pre_go_live";
    numbers?: string[];
    metadata?: Record<string, unknown>;
  } = {},
) {
  const id = randomUUID();
  const mode = options.mode ?? "pre_go_live";
  const metadata = options.metadata ??
    {
      ai_gate: mode === "pre_go_live" ? "allowlist" : "open",
      ai_gate_mode: "pre_go_live",
      ai_test_phone_numbers: options.numbers ?? ["+5511999998888"],
      transport: { preserved: true },
    };
  await db.query(
    "insert into channel_sessions(id,organization_id,waha_session_name,status,webhook_secret_encrypted,metadata,archived_at) values($1,$2,$3,$4,'\\x00',$5,$6)",
    [id, org, id, options.status ?? "WORKING", metadata, options.archived ? new Date() : null],
  );
  return id;
}

export async function confirm(f: Fixture, overrides: Partial<Pick<Fixture, "org" | "user" | "version" | "run">> = {}) {
  return (
    await db.query("select fn_confirmar_agente_revisado_onboarding($1,$2,1,$3,$4) r", [
      overrides.org ?? f.org,
      overrides.user ?? f.user,
      overrides.version ?? f.version,
      overrides.run ?? f.run,
    ])
  ).rows[0].r;
}

export async function activate(
  f: Fixture,
  channelId: string,
  overrides: Partial<Pick<Fixture, "org" | "user" | "version" | "run">> & {
    revision?: number;
    installationKey?: boolean;
  } = {},
) {
  return (
    await db.query("select fn_ativar_agente_teste_onboarding($1,$2,$3,$4,$5,$6,$7) r", [
      overrides.org ?? f.org,
      overrides.user ?? f.user,
      overrides.revision ?? 1,
      overrides.version ?? f.version,
      overrides.run ?? f.run,
      channelId,
      overrides.installationKey ?? true,
    ])
  ).rows[0].r;
}

export async function agentState(f: Fixture) {
  return (
    await db.query(
      "select is_active,is_default,published_version_id from ai_agents where id=$1 and organization_id=$2",
      [f.agent, f.org],
    )
  ).rows[0];
}

export async function versionState(f: Fixture) {
  return (
    await db.query(
      "select status,channel_session_id,published_at from ai_agent_versions where id=$1 and organization_id=$2",
      [f.version, f.org],
    )
  ).rows[0];
}

export async function expectInactive(f: Fixture) {
  expect(await agentState(f)).toEqual({
    is_active: false,
    is_default: false,
    published_version_id: null,
  });
  expect(await versionState(f)).toEqual({
    status: "draft",
    channel_session_id: null,
    published_at: null,
  });
}

export async function auditCount(f: Fixture, action: string) {
  return (
    await db.query(
      "select count(*)::int n from api_audit_log where organization_id=$1 and action=$2",
      [f.org, action],
    )
  ).rows[0].n as number;
}
