import { beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ read: vi.fn(), from: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error("REDIRECT:" + to); } }));
vi.mock("@/lib/auth/server", () => ({ requireAuth: async () => ({ id: "user", idioma: "pt-BR" }), resolveActiveOrg: async () => ({ orgId: "org" }) }));
vi.mock("@/lib/onboarding/jornada", () => ({ lerJornada: f.read }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: f.from }) }));
vi.mock("@/lib/env", () => ({ env: { NUVEMSHOP_ENABLED: false } }));
vi.mock("@/app/onboarding/done/_client", () => ({ DoneClient: () => null }));
vi.mock("@/app/onboarding/testar/_client", () => ({ TestarClient: () => null }));
import DonePage from "@/app/onboarding/done/page";
import TestarPage from "@/app/onboarding/testar/page";
beforeEach(() => {
  vi.clearAllMocks(); f.read.mockResolvedValue({ state: {}, onboardedAt: null });
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: null }) };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); f.from.mockReturnValue(query);
});
it("done direto retorna ao primeiro passo pendente sem prometer conclusão", async () => {
  await expect(DonePage()).rejects.toThrow("REDIRECT:/onboarding/welcome");
});
it("ensaio legado direto não é oferecido a conta nova", async () => {
  await expect(TestarPage()).rejects.toThrow("REDIRECT:/onboarding");
  expect(f.from).not.toHaveBeenCalled();
});
