import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { processarPostbackMonetizze } from "@/lib/billing/monetizze/processar";

vi.mock("@/lib/env", () => ({
  env: {
    MONETIZZE_CHAVE_UNICA: "segredo-correto",
    MONETIZZE_PLANO_REFERENCIA_BASICO: "CY386459",
    MONETIZZE_PLANO_REFERENCIA_ESSENCIAL: "FW386460",
    MONETIZZE_PLANO_REFERENCIA_COMPLETO: "VM386461",
  },
}));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/billing/monetizze/processar", () => ({ processarPostbackMonetizze: vi.fn() }));

function request(chave = "segredo-correto") {
  return new NextRequest("http://localhost/api/v1/webhooks/monetizze", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10" },
    body: JSON.stringify({
      id: "webhook-1",
      data: "2026-09-24 12:30:00",
      chave_unica: chave,
      codigo_venda: "venda-1",
      codigo_status: "2",
      postback_evento: "2",
      produto: { codigo: "produto-1" },
      plano: { referencia: "CY386459" },
      comprador: { email: "dono@example.test" },
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkRateLimit).mockResolvedValue({
    allowed: true, count: 1, limit: 60, window_sec: 60, reset_at: 0,
  });
  vi.mocked(processarPostbackMonetizze).mockResolvedValue({ status: "applied" });
});

describe("POST /api/v1/webhooks/monetizze", () => {
  it("autentica, limita e processa sem devolver a chave", async () => {
    const { POST } = await import("./route");
    const response = await POST(request());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(checkRateLimit).toHaveBeenCalledTimes(2);
    expect(processarPostbackMonetizze).toHaveBeenCalledTimes(1);
    expect(body).not.toContain("segredo-correto");
    expect(body).not.toContain("dono@example.test");
  });

  it("recusa chave inválida sem chamar o processador nem vazar valores", async () => {
    const { POST } = await import("./route");
    const response = await POST(request("segredo-invalido"));
    const body = await response.text();

    expect(response.status).toBe(401);
    expect(processarPostbackMonetizze).not.toHaveBeenCalled();
    expect(body).not.toContain("segredo-invalido");
    expect(body).not.toContain("segredo-correto");
  });

  it("acima do limite responde 429 com Retry-After", async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      allowed: false, count: 61, limit: 60, window_sec: 60, reset_at: 0,
    });
    const { POST } = await import("./route");
    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(processarPostbackMonetizze).not.toHaveBeenCalled();
  });

  it("duplicata conhecida retorna sucesso para impedir retries infinitos", async () => {
    vi.mocked(processarPostbackMonetizze).mockResolvedValueOnce({ status: "duplicate" });
    const { POST } = await import("./route");
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({ data: { status: "duplicate" } }));
  });
});
