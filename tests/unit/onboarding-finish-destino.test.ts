import { beforeEach, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ admin: vi.fn(), redirect: vi.fn(), concluido: true }));
vi.mock("@/app/actions/onboarding/_shared", () => ({ requireOnboardingCtx: async () => ({ orgId: "org-a", userId: "user-a" }), OnboardingError: class extends Error {} }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: f.redirect }));
vi.mock("@/lib/env", () => ({ env: { NUVEMSHOP_ENABLED: false } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: f.admin }));
import { finishOnboarding } from "@/app/actions/onboarding/finishOnboarding";

beforeEach(() => {
  vi.clearAllMocks(); f.concluido = true;
  f.admin.mockReturnValue({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { onboarded_at: f.concluido ? "2026-09-12T12:00:00Z" : null, onboarding_state: {} }, error: null }) }) }) }) });
});

it.each([undefined, "/app/products", "/app/ai/knowledge/sources"])("conclusão permite somente o destino legítimo %s", async (destino) => {
  await finishOnboarding(destino);
  expect(f.redirect).toHaveBeenCalledWith(destino ?? "/app/inbox");
});

it.each(["https://fora.example/", "//fora.example/", "/admin", "/app/products?redirect=https://fora.example"])("recusa destino não autorizado %s sem tocar banco", async (destino) => {
  expect(await finishOnboarding(destino)).toMatchObject({ ok: false, error: "forbidden" });
  expect(f.admin).not.toHaveBeenCalled();
  expect(f.redirect).not.toHaveBeenCalled();
});

it("pedir revisão não permite pular os passos pendentes", async () => {
  f.concluido = false;
  expect(await finishOnboarding("/app/products")).toMatchObject({ ok: false, error: "forbidden" });
  expect(f.redirect).not.toHaveBeenCalled();
});
