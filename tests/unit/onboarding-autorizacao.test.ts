// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({ role: "admin" as string | null, mfa: false, rpcError: false }));
const admin = vi.hoisted(() => vi.fn(() => { throw new Error("service role alcançado antes da autorização"); }));
const assinarConvite = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/invite-token", () => ({ signInviteToken: assinarConvite, INVITE_TTL_SECONDS: 60 }));

vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: vi.fn(async () => ({ id: "user-local", email: "qa@example.test", full_name: "QA", idioma: "pt-BR", organizations: [] })),
  resolveActiveOrg: vi.fn(async () => ({ orgId: "org-local", name: "QA", role: estado.role })),
  mfaEmDivida: vi.fn(async () => estado.mfa),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc: vi.fn(async () => ({ data: estado.role, error: estado.rpcError ? { message: "indisponível" } : null })) })),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: admin }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { acceptWelcome } from "@/app/actions/onboarding/acceptWelcome";
import { requireOnboardingCtx } from "@/app/actions/onboarding/_shared";
import { sendOnboardingInvites } from "@/app/actions/onboarding/sendOnboardingInvites";
import { dadosDoPasso } from "@/app/actions/onboarding/montarQuadro";

beforeEach(() => {
  estado.role = "admin";
  estado.mfa = false;
  estado.rpcError = false;
  admin.mockClear();
  assinarConvite.mockClear();
});

describe("autorização das mutações do onboarding", () => {
  it.each(["viewer", "agent", "manager", null])("%s não alcança service role pela action", async (role) => {
    estado.role = role;
    const form = new FormData();
    form.set("display_name", "Negócio de teste");
    expect(await acceptWelcome(form)).toMatchObject({ ok: false, error: "forbidden" });
    expect(admin).not.toHaveBeenCalled();
  });

  it("admin autorizado recebe apenas a organização da sessão", async () => {
    expect(await requireOnboardingCtx()).toMatchObject({ userId: "user-local", orgId: "org-local", role: "admin" });
  });

  it("falha fechada se o papel não puder ser revalidado", async () => {
    estado.rpcError = true;
    await expect(requireOnboardingCtx()).rejects.toMatchObject({ code: "forbidden" });
  });

  it("admin com MFA em dívida não altera a organização", async () => {
    estado.mfa = true;
    await expect(requireOnboardingCtx()).rejects.toMatchObject({ code: "mfa_required" });
  });
  it.each(["viewer", "agent", "manager"])("%s não emite convite de administrador", async (role) => {
    estado.role = role;
    expect(await sendOnboardingInvites({ invitations: [{ email: "qa@example.test", role: "admin" }] }))
      .toMatchObject({ ok: false, error: "forbidden" });
    expect(assinarConvite).not.toHaveBeenCalled();
    expect(admin).not.toHaveBeenCalled();
  });
  it("leitura do quadro também exige autorização antes do acesso privilegiado", async () => {
    estado.role = "viewer";
    await expect(dadosDoPasso()).rejects.toMatchObject({ code: "forbidden" });
    expect(admin).not.toHaveBeenCalled();
  });
});
