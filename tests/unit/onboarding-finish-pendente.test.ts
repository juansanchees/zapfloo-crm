import { expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ update: vi.fn(), insert: vi.fn() }));
vi.mock("@/app/actions/onboarding/_shared", () => ({ requireOnboardingCtx: async () => ({ orgId: "org", userId: "user" }), OnboardingError: class extends Error {} }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { onboarded_at: null, onboarding_state: {} }, error: null }) }) }), update: f.update, insert: f.insert }) }) }));
import { finishOnboarding } from "@/app/actions/onboarding/finishOnboarding";
it("conclusão direta com passos pendentes não conclui org nem emite evento", async () => {
  f.update.mockReturnValue({ eq: () => ({ is: async () => ({ error: null }) }) });
  const result = await finishOnboarding();
  expect(result).toMatchObject({ ok: false, error: "forbidden" });
  expect(f.update).not.toHaveBeenCalled(); expect(f.insert).not.toHaveBeenCalled();
});
