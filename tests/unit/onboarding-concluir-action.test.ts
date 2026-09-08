import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Shared from "@/app/actions/onboarding/_shared";

const f = vi.hoisted(() => ({
  ctx: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  chave: vi.fn(),
}));

vi.mock("@/app/actions/onboarding/_shared", async (original) => ({
  ...(await original<typeof Shared>()),
  requireOnboardingCtx: f.ctx,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: f.rpc, from: f.from }),
}));
vi.mock("@/lib/ai/runtime/agent", () => ({ chaveDePlataforma: f.chave }));

import {
  ativarAgenteParaTeste,
  confirmarAgenteRevisado,
} from "@/app/actions/onboarding/concluir";
import { onboardingStateSchema } from "@/lib/schemas/onboarding";

const org = "11111111-1111-4111-8111-111111111111";
const user = "22222222-2222-4222-8222-222222222222";
const agent = "33333333-3333-4333-8333-333333333333";
const version = "44444444-4444-4444-8444-444444444444";
const run = "55555555-5555-4555-8555-555555555555";
const channel = "66666666-6666-4666-8666-666666666666";
const context = createHash("sha256")
  .update(JSON.stringify(["onboarding-draft", user, org]))
  .digest("hex");
const proof = {
  expected_context: context,
  expected_revision: 3,
  expected_version_id: version,
  run_id: run,
};

function leituraDaVersao(data: unknown, error: unknown = null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  f.from.mockReturnValue(query);
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  f.ctx.mockResolvedValue({ orgId: org, userId: user });
  f.chave.mockReturnValue("chave-sintetica-nao-exposta");
  leituraDaVersao({ provider: "openai", credential_id: null });
  f.rpc.mockImplementation(async (name: string) => ({
    data:
      name === "fn_confirmar_agente_revisado_onboarding"
        ? { agent_id: agent, version_id: version }
        : {
            agent_id: agent,
            version_id: version,
            channel_session_id: channel,
            activated_at: "2026-09-08T20:00:00.000Z",
          },
    error: null,
  }));
});

describe("conclusão do onboarding: identidade e capacidade ficam no servidor", () => {
  it("mantém o estado legado parseável e aceita o recibo aditivo do novo fluxo", () => {
    expect(
      onboardingStateSchema.safeParse({
        ai: { agent_id: agent, prompt_template: "support_minimal" },
        whatsapp: { status: "WORKING", session_id: "legado" },
      }).success,
    ).toBe(true);
    expect(
      onboardingStateSchema.safeParse({
        ai: {
          agent_id: agent,
          flow: "reviewed_draft_v2",
          revision: 3,
          version_id: version,
          run_id: run,
          review_confirmed_at: "2026-09-08T20:00:00.000Z",
          restricted_activation: {
            draft_revision: 3,
            run_id: run,
            call_id: user,
            agent_id: agent,
            version_id: version,
            channel_session_id: channel,
            snapshot_sha256: "a".repeat(64),
            access_mode: "pre_go_live",
            test_phone_count: 1,
            activated_at: "2026-09-08T20:01:00.000Z",
            actor_id: user,
          },
        },
        whatsapp: {
          channel_session_id: channel,
          status: "restricted_active",
          activated_at: "2026-09-08T20:01:00.000Z",
        },
      }).success,
    ).toBe(true);
  });

  it("confirma a revisão com contexto confiável e devolve DTO mínimo", async () => {
    await expect(confirmarAgenteRevisado(proof)).resolves.toEqual({
      ok: true,
      agent_id: agent,
      version_id: version,
    });
    expect(f.rpc).toHaveBeenCalledWith("fn_confirmar_agente_revisado_onboarding", {
      p_org_id: org,
      p_actor_id: user,
      p_expected_revision: 3,
      p_expected_version_id: version,
      p_run_id: run,
    });
  });

  it("recusa campos forjados antes de consultar ou mutar", async () => {
    for (const patch of [
      { organization_id: org },
      { actor_id: user },
      { provider: "openai" },
      { installation_key_available: true },
      { session_name: "forjada" },
      { status: "WORKING" },
      { metadata: { ai_gate: "allowlist" } },
    ]) {
      await expect(confirmarAgenteRevisado({ ...proof, ...patch })).resolves.toEqual({
        ok: false,
        error: "invalid_input",
      });
      await expect(
        ativarAgenteParaTeste({ ...proof, channel_session_id: channel, ...patch }),
      ).resolves.toEqual({ ok: false, error: "invalid_input" });
    }
    expect(f.from).not.toHaveBeenCalled();
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("contexto de outra sessão falha antes da leitura da versão", async () => {
    f.ctx.mockResolvedValue({ orgId: org, userId: agent });
    await expect(confirmarAgenteRevisado(proof)).resolves.toEqual({
      ok: false,
      error: "draft_context_changed",
    });
    await expect(
      ativarAgenteParaTeste({ ...proof, channel_session_id: channel }),
    ).resolves.toEqual({ ok: false, error: "draft_context_changed" });
    expect(f.from).not.toHaveBeenCalled();
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("calcula no servidor a chave da instalação usando o provider persistido", async () => {
    const query = leituraDaVersao({ provider: "openai", credential_id: null });
    await expect(
      ativarAgenteParaTeste({ ...proof, channel_session_id: channel }),
    ).resolves.toMatchObject({ ok: true, agent_id: agent, version_id: version });

    expect(f.from).toHaveBeenCalledWith("ai_agent_versions");
    expect(query.eq).toHaveBeenNthCalledWith(1, "id", version);
    expect(query.eq).toHaveBeenNthCalledWith(2, "organization_id", org);
    expect(f.chave).toHaveBeenCalledWith("openai");
    expect(f.rpc).toHaveBeenCalledWith(
      "fn_ativar_agente_teste_onboarding",
      expect.objectContaining({
        p_org_id: org,
        p_actor_id: user,
        p_channel_session_id: channel,
        p_installation_key_available: true,
      }),
    );
  });

  it("credencial da organização não depende nem consulta chave de instalação", async () => {
    leituraDaVersao({ provider: "openai", credential_id: agent });
    await ativarAgenteParaTeste({ ...proof, channel_session_id: channel });
    expect(f.chave).not.toHaveBeenCalled();
    expect(f.rpc).toHaveBeenCalledWith(
      "fn_ativar_agente_teste_onboarding",
      expect.objectContaining({ p_installation_key_available: false }),
    );
  });

  it("falha fechada se não consegue reler provider/credencial da versão", async () => {
    leituraDaVersao(null, { message: "segredo-do-banco" });
    await expect(
      ativarAgenteParaTeste({ ...proof, channel_session_id: channel }),
    ).resolves.toEqual({ ok: false, error: "db_error" });
    expect(f.chave).not.toHaveBeenCalled();
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("normaliza erro SQL e nunca devolve mensagem arbitrária", async () => {
    f.rpc.mockResolvedValue({ data: null, error: { message: "activation_channel_not_restricted" } });
    await expect(
      ativarAgenteParaTeste({ ...proof, channel_session_id: channel }),
    ).resolves.toEqual({ ok: false, error: "activation_channel_not_restricted" });

    f.rpc.mockResolvedValue({ data: null, error: { message: "sk-nao-pode-sair" } });
    await expect(confirmarAgenteRevisado(proof)).resolves.toEqual({
      ok: false,
      error: "db_error",
    });
  });
});
