import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BillingAdminClient } from "@/app/admin/(protected)/billing/_client";

const SETTINGS = {
  data: {
    enforcement_enabled: false,
    can_mutate: true,
    updated_at: null,
    updated_by: null,
    review: {
      total_organizations: 8,
      expired_count: 2,
      legacy_count: 3,
      paused_count: 1,
      pending_count: 1,
    },
  },
};
const ORGANIZATIONS = {
  data: [
    {
      organization_id: "10000000-0000-4000-8000-000000000001",
      organization_name: "Clínica Aurora",
      organization_created_at: "2026-01-01T00:00:00.000Z",
      plan_id: "completo",
      status: "ativo",
      billing_provider: "monetizze",
      last_payment_at: "2026-09-01T00:00:00.000Z",
      paid_through: "2026-10-01T00:00:00.000Z",
      access_until: "2026-10-04T00:00:00.000Z",
      subscription_updated_at: "2026-09-01T00:00:00.000Z",
      access_allowed: true,
      access_reason: "subscription_active",
      review_required: false,
    },
    {
      organization_id: "10000000-0000-4000-8000-000000000002",
      organization_name: "Clínica Legada",
      organization_created_at: "2026-01-01T00:00:00.000Z",
      plan_id: null,
      status: null,
      billing_provider: null,
      last_payment_at: null,
      paid_through: null,
      access_until: null,
      subscription_updated_at: null,
      access_allowed: true,
      access_reason: "legacy_unreviewed",
      review_required: true,
    },
  ],
  meta: { has_more: false, cursor: null },
};
const UNMATCHED = {
  data: [{
    id: "20000000-0000-4000-8000-000000000001",
    provider: "monetizze",
    event_kind: "subscription",
    event_at: "2026-09-24T10:00:00.000Z",
    product_code: "produto",
    plan_id: "completo",
    target_status: "ativo",
    buyer_email_masked: "j***@example.test",
    received_at: "2026-09-24T10:01:00.000Z",
    error_code: null,
  }],
  meta: { has_more: false, cursor: null },
};

function response(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  }));
}

function installFetch(options: { readonly?: boolean; linkStatus?: number; refreshFails?: boolean } = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let linked = false;
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("/settings") && init?.method === "PATCH") {
      return response({ data: { enforcement_enabled: true } });
    }
    if (url.includes("/settings")) {
      if (linked && options.refreshFails) {
        return response({ error: { code: "refresh_failed" } }, 503);
      }
      return response({
        data: {
          ...SETTINGS.data,
          can_mutate: !options.readonly,
          review: { ...SETTINGS.data.review, pending_count: linked ? 0 : 1 },
        },
      });
    }
    if (url.includes("/organizations")) {
      return linked && options.refreshFails
        ? response({ error: { code: "refresh_failed" } }, 503)
        : response(ORGANIZATIONS);
    }
    if (url.includes("/unmatched/") && init?.method === "POST") {
      if (options.linkStatus === 409) {
        return response({ error: { code: "state_conflict", message: "no longer pending" } }, 409);
      }
      linked = true;
      return response({ data: { status: "linked" } });
    }
    if (url.includes("/unmatched")) return response(UNMATCHED);
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", mock);
  return { calls, mock };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("painel de cobrança da plataforma", () => {
  it("support_readonly revisa dados, mas não consegue mutar", async () => {
    installFetch({ readonly: true });
    render(<BillingAdminClient />);
    const toggle = await screen.findByRole("switch", { name: "Aplicar bloqueio comercial" });
    expect(toggle).toBeDisabled();
    expect((await screen.findAllByText("Clínica Aurora")).length).toBeGreaterThan(0);
    expect(screen.getByText("Sem assinatura")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vincular compra" })).toBeDisabled();
  });

  it("mostra o impacto e só liga depois da confirmação explícita", async () => {
    const { calls } = installFetch();
    render(<BillingAdminClient />);
    const toggle = await screen.findByRole("switch", { name: "Aplicar bloqueio comercial" });
    fireEvent.click(toggle);

    expect(await screen.findByRole("alertdialog")).toHaveTextContent("2 organizações vencidas");
    expect(screen.getByRole("alertdialog")).toHaveTextContent("3 organizações legadas");
    expect(screen.getByRole("alertdialog")).toHaveTextContent("1 organização pausada");
    expect(screen.getByRole("alertdialog")).toHaveTextContent("1 compra pendente");
    expect(calls.filter((call) => call.init?.method === "PATCH")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Confirmar e ativar" }));
    await waitFor(() => expect(calls.filter((call) => call.init?.method === "PATCH")).toHaveLength(1));
    const mutation = calls.find((call) => call.init?.method === "PATCH");
    expect(JSON.parse(String(mutation?.init?.body))).toEqual({
      enforcement_enabled: true,
      confirmation: "ATIVAR BLOQUEIO COMERCIAL",
    });
    expect(calls.some((call) => call.url.includes("organization_subscriptions") && call.init?.method)).toBe(false);
  });

  it("concilia em uma ação e deixa o conflito da segunda tentativa visível", async () => {
    const { calls } = installFetch({ linkStatus: 409 });
    render(<BillingAdminClient />);
    await screen.findByText("j***@example.test");
    fireEvent.change(screen.getByLabelText("Organização para vincular"), {
      target: { value: "10000000-0000-4000-8000-000000000001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Vincular compra" }));

    expect(await screen.findByText("Esta compra já foi conciliada por outra ação.")).toBeInTheDocument();
    const mutation = calls.find((call) => call.url.includes("/unmatched/") && call.init?.method === "POST");
    expect(JSON.parse(String(mutation?.init?.body))).toEqual({
      organization_id: "10000000-0000-4000-8000-000000000001",
      reason: "Conciliação manual pelo painel de cobrança",
    });
    expect(screen.getByText("j***@example.test")).toBeInTheDocument();
  });

  it("remove a compra da fila e atualiza as organizações após conciliar", async () => {
    const { calls } = installFetch();
    render(<BillingAdminClient />);
    await screen.findByText("j***@example.test");
    fireEvent.change(screen.getByLabelText("Organização para vincular"), {
      target: { value: "10000000-0000-4000-8000-000000000001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Vincular compra" }));

    expect(await screen.findByText("Compra vinculada e assinatura atualizada.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("j***@example.test")).not.toBeInTheDocument());
    expect(calls.filter((call) => call.url.includes("/organizations"))).toHaveLength(2);
    expect(calls.filter((call) => call.url.includes("/settings"))).toHaveLength(2);
    fireEvent.click(screen.getByRole("switch", { name: "Aplicar bloqueio comercial" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("0 compras pendentes");
  });

  it("mantém o sucesso inequívoco quando só o refresh posterior falha", async () => {
    const { calls } = installFetch({ refreshFails: true });
    render(<BillingAdminClient />);
    await screen.findByText("j***@example.test");
    fireEvent.change(screen.getByLabelText("Organização para vincular"), {
      target: { value: "10000000-0000-4000-8000-000000000001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Vincular compra" }));

    expect(await screen.findByText("Compra vinculada e assinatura atualizada.")).toBeInTheDocument();
    expect(await screen.findByText("Compra vinculada; não foi possível atualizar a revisão.")).toBeInTheDocument();
    expect(screen.queryByText("Não foi possível vincular esta compra.")).not.toBeInTheDocument();
    expect(screen.queryByText("j***@example.test")).not.toBeInTheDocument();
    expect(calls.filter((call) => call.url.includes("/unmatched/") && call.init?.method === "POST")).toHaveLength(1);
  });
});
