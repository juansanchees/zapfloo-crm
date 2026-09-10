// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ctx: vi.fn(),
  load: vi.fn(),
  patch: vi.fn(),
  audit: vi.fn(),
  admin: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/app/actions/onboarding/_shared", () => ({
  requireOnboardingCtx: mocks.ctx,
  loadOnboardingState: mocks.load,
  patchOnboardingState: mocks.patch,
  OnboardingError: class OnboardingError extends Error {},
}));

import { skipAi } from "@/app/actions/onboarding/createDefaultAgent";
import { contextoDoRascunho } from "@/lib/onboarding/contexto-rascunho";

const contexto = contextoDoRascunho("user", "org");

const receipt = {
  draft_revision: 3,
  run_id: "11111111-1111-4111-8111-111111111111",
  call_id: "22222222-2222-4222-8222-222222222222",
  agent_id: "33333333-3333-4333-8333-333333333333",
  version_id: "44444444-4444-4444-8444-444444444444",
  channel_session_id: "55555555-5555-4555-8555-555555555555",
  snapshot_sha256: "a".repeat(64),
  access_mode: "pre_go_live" as const,
  test_phone_count: 1,
  activated_at: "2026-09-10T12:00:00.000Z",
  actor_id: "66666666-6666-4666-8666-666666666666",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ctx.mockResolvedValue({ userId: "user", orgId: "org" });
  mocks.patch.mockResolvedValue(undefined);
  mocks.audit.mockResolvedValue(undefined);
});

describe("adiamento explícito da IA", () => {
  it("preserva a IA e audita o adiamento somente depois de persistir", async () => {
    const ai = {
      agent_id: receipt.agent_id,
      prompt_template: "support_minimal",
      flow: "reviewed_draft_v2" as const,
      revision: 3,
      version_id: receipt.version_id,
      run_id: receipt.run_id,
      review_confirmed_at: "2026-09-10T11:00:00.000Z",
      restricted_activation: receipt,
    };
    mocks.load.mockResolvedValue({ state: { ai }, onboardedAt: null });

    await expect(skipAi({ expected_context: contexto })).rejects.toThrow("REDIRECT:/onboarding");

    expect(mocks.patch).toHaveBeenCalledWith("org", { ai: { ...ai, skipped: true } });
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledOnce();
    expect(mocks.audit).toHaveBeenCalledWith({
      action: "onboarding.ai_skipped",
      actorUserId: "user",
      organizationId: "org",
    });
    expect(mocks.patch.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.audit.mock.invocationCallOrder[0]!,
    );
    expect(mocks.audit.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.redirect.mock.invocationCallOrder[0]!,
    );
  });

  it("erro ao persistir não marca a etapa nem navega", async () => {
    mocks.load.mockResolvedValue({ state: {}, onboardedAt: null });
    mocks.patch.mockRejectedValue(new Error("db_error"));

    await expect(skipAi({ expected_context: contexto })).rejects.toThrow("db_error");

    expect(mocks.patch).toHaveBeenCalledOnce();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("formulário da organização A não adia IA na organização B do cookie", async () => {
    const contextoDaOrganizacaoA = contextoDoRascunho("user", "org-a");

    await expect(skipAi({ expected_context: contextoDaOrganizacaoA })).resolves.toEqual({
      ok: false,
      error: "draft_context_changed",
    });

    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
