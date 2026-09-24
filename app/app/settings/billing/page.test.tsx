import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import BillingPage from "./page";

const { auth, org, maybeSingle, avaliar, clientProps } = vi.hoisted(() => ({
  auth: vi.fn(),
  org: vi.fn(),
  maybeSingle: vi.fn(),
  avaliar: vi.fn(),
  clientProps: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ requireAuth: auth, resolveActiveOrg: org }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}));
vi.mock("@/lib/billing/acesso-server", () => ({ avaliarAcessoComercial: avaliar }));
vi.mock("@/lib/env", () => ({
  env: {
    MONETIZZE_CHAVE_UNICA: "segredo-de-teste-longo-e-server-only",
    MONETIZZE_CHECKOUT_BASICO: "https://app.monetizze.com.br/checkout/BASICO",
    MONETIZZE_CHECKOUT_ESSENCIAL: "https://app.monetizze.com.br/checkout/ESSENCIAL",
    MONETIZZE_CHECKOUT_COMPLETO: "https://app.monetizze.com.br/checkout/COMPLETO",
  },
}));
vi.mock("./_client", () => ({
  BillingClient: (props: Record<string, unknown>) => {
    clientProps(props);
    return <div>billing-client</div>;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({
    id: "user-1",
    email: "dona@example.com",
    idioma: "pt-BR",
    is_platform_admin: false,
  });
  org.mockResolvedValue({
    orgId: "11111111-1111-4111-8111-111111111111",
    name: "Clínica",
    role: "admin",
  });
  maybeSingle.mockResolvedValue({
    data: {
      plan_id: "essencial",
      status: "ativo",
      access_until: "2026-10-27T12:00:00.000Z",
      paid_through: "2026-10-24T12:00:00.000Z",
    },
    error: null,
  });
  avaliar.mockResolvedValue({
    allowed: true,
    reason: "subscription_active",
    accessUntil: "2026-10-27T12:00:00.000Z",
    enforcementEnabled: true,
  });
});

describe("porta do cliente para cobrança", () => {
  it("lê assinatura no escopo ativo e gera os três checkouts no servidor", async () => {
    render(await BillingPage());

    expect(avaliar).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
    const props = clientProps.mock.calls[0]?.[0] as {
      checkouts: Record<string, string>;
      assinatura: Record<string, string>;
    };
    expect(props.assinatura).toMatchObject({ plan_id: "essencial", status: "ativo" });
    expect(new URL(props.checkouts.basico!).searchParams.get("email")).toBe("dona@example.com");
    expect(new URL(props.checkouts.completo!).searchParams.get("src")).toBeTruthy();
    expect(JSON.stringify(props)).not.toContain("segredo-de-teste-longo-e-server-only");
    expect(JSON.stringify(props)).not.toContain("11111111-1111-4111-8111-111111111111");
  });

  it("continua informativa quando não há linha de assinatura", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    render(await BillingPage());
    expect(clientProps.mock.calls[0]?.[0]).toMatchObject({
      assinatura: { plan_id: null, status: null, access_until: null, paid_through: null },
    });
  });

  it.each(["viewer", "agent", "manager"])("mantém cobrança administrativa fechada para %s", async (role) => {
    org.mockResolvedValueOnce({ orgId: "org-1", role });
    await expect(BillingPage()).rejects.toThrow("redirect:/403");
    expect(maybeSingle).not.toHaveBeenCalled();
  });
});
