import { beforeEach, expect, it, vi } from "vitest";
import { contextoDoRascunho } from "@/lib/onboarding/contexto-rascunho";
const f = vi.hoisted(() => ({ load: vi.fn(), patch: vi.fn(), admin: vi.fn() }));
vi.mock("@/app/actions/onboarding/_shared", () => ({ requireOnboardingCtx: async () => ({ orgId: "org", userId: "user" }), loadOnboardingState: f.load, patchOnboardingState: f.patch, OnboardingError: class extends Error {} }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: f.admin }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { acceptWelcome } from "@/app/actions/onboarding/acceptWelcome";
beforeEach(() => { vi.clearAllMocks(); f.load.mockResolvedValue({ state: {}, onboardedAt: "2026-09-08T12:00:00Z" }); });
function form(context = contextoDoRascunho("user", "org")) { const f = new FormData(); f.set("display_name", "QA"); f.set("expected_context", context); return f; }
it("formulário de outra organização não altera negócio da sessão nova", async () => {
  expect(await acceptWelcome(form(contextoDoRascunho("user", "outra")))).toMatchObject({ ok: false, error: "forbidden" });
  expect(f.patch).not.toHaveBeenCalled(); expect(f.admin).not.toHaveBeenCalled();
});
it("organização já concluída permanece intacta", async () => {
  expect(await acceptWelcome(form())).toMatchObject({ ok: false, error: "forbidden" });
  expect(f.patch).not.toHaveBeenCalled(); expect(f.admin).not.toHaveBeenCalled();
});
