// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ctx: vi.fn(), set: vi.fn(), admin: vi.fn(), logError: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }),
}));
vi.mock("@/app/actions/onboarding/_shared", () => ({ requireOnboardingCtx: mocks.ctx }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.set }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://crm.example.test" } }));
vi.mock("@/lib/logger", () => ({ logger: { error: mocks.logError } }));

import { explorarCrm, configurarChaveDoOnboarding, gerenciarAgenteDoOnboarding } from "@/app/actions/onboarding/explorar";
import { exploracaoPertenceA } from "@/lib/onboarding/exploracao";
import { env } from "@/lib/env";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ctx.mockResolvedValue({ userId: "user-local", orgId: "org-local" });
  env.NEXT_PUBLIC_APP_URL = "https://crm.example.test";
});

describe("explorar não conclui nem ativa a organização", () => {
  it.each([[configurarChaveDoOnboarding, "/app/ai/credentials"], [gerenciarAgenteDoOnboarding, "/app/ai/agents"]] as const)("gestão específica usa a mesma exploração e guard", async (action, destination) => {
    await expect(action()).rejects.toThrow("REDIRECT:" + destination);
    expect(mocks.set).toHaveBeenCalledOnce();
    expect(mocks.admin).not.toHaveBeenCalled();
    mocks.set.mockClear(); mocks.redirect.mockClear();
    mocks.ctx.mockRejectedValue(new Error("forbidden"));
    await expect(action()).rejects.toThrow("forbidden");
    expect(mocks.set).not.toHaveBeenCalled(); expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("não descarta a preferência em instalação HTTP", async () => {
    env.NEXT_PUBLIC_APP_URL = "http://crm.example.test";
    await expect(explorarCrm()).rejects.toThrow("REDIRECT:/app/inbox");
    expect(mocks.set.mock.calls[0]![2].secure).toBe(false);
  });
  it("recusa guardar a preferência se a autorização falhar", async () => {
    mocks.ctx.mockRejectedValue({ name: "OnboardingError", code: "forbidden", message: "dado que não vai ao log" });
    await expect(explorarCrm()).resolves.toEqual({ ok: false, error: "forbidden" });
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(String), {
      error: "forbidden",
      expected: true,
    });
    expect(JSON.stringify(mocks.logError.mock.calls)).not.toContain("dado que não vai ao log");
  });

  it("permite sair somente para o par autenticado, sem alterar o banco", async () => {
    await expect(explorarCrm()).rejects.toThrow("REDIRECT:/app/inbox");
    expect(mocks.set).toHaveBeenCalledOnce();
    const [nome, valor, opcoes] = mocks.set.mock.calls[0]!;
    expect(nome).toBe("onboarding_explore");
    expect(opcoes).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(opcoes.secure).toBe(true);
    expect(exploracaoPertenceA(valor, "user-local", "org-local")).toBe(true);
    expect(exploracaoPertenceA(valor, "outro-user", "org-local")).toBe(false);
    expect(exploracaoPertenceA(valor, "user-local", "outra-org")).toBe(false);
    expect(exploracaoPertenceA(undefined, "user-local", "org-local")).toBe(false);
    expect(exploracaoPertenceA("", "", "")).toBe(false);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("não exige número conectado nem chave própria para explorar", async () => {
    mocks.ctx.mockResolvedValue({ userId: "user-local", orgId: "org-local" });
    await expect(explorarCrm()).rejects.toThrow("REDIRECT:/app/inbox");
    expect(mocks.set).toHaveBeenCalledOnce();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
