// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn() }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://supabase.invalid",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-test",
    NEXT_PUBLIC_APP_URL: "https://crm.invalid",
    IMPERSONATE_COOKIE_SECRET: "segredo-de-teste",
  },
}));
vi.mock("@/lib/plataformas-de-anuncio/meta/oauth/limite", () => ({
  limitarPaginaOAuth: vi.fn(async () => null),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
});

describe("proxy — método e caminho comerciais são confiáveis", () => {
  it("sobrescreve headers falsificados com o método/path reais antes de encaminhar", async () => {
    const { proxy } = await import("@/proxy");
    const resposta = await proxy(new NextRequest(
      "https://crm.invalid/api/v1/automation-rules?x=1",
      {
        method: "POST",
        headers: {
          "x-request-method": "GET",
          "x-pathname": "/api/v1/billing/checkout",
        },
      },
    ));

    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("x-middleware-request-x-request-method")).toBe("POST");
    expect(resposta.headers.get("x-middleware-request-x-pathname")).toBe("/api/v1/automation-rules");
    expect(resposta.headers.get("x-middleware-override-headers")).toContain("x-request-method");
    expect(resposta.headers.get("x-middleware-override-headers")).toContain("x-pathname");
  });
});
