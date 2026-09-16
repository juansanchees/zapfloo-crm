// @vitest-environment node
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const doubles = vi.hoisted(() => ({
  secrets: { INTERNAL_SECRET: "segredo-local-do-teste", INTERNAL_CRON_SECRET: "" },
  recuperar: vi.fn(), reenfileirar: vi.fn(), enfileirarAcervo: vi.fn(), processar: vi.fn(), requireRole: vi.fn(), after: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ env: doubles.secrets }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: doubles.requireRole }));
vi.mock("next/server", async (original) => ({ ...await original<typeof import("next/server")>(), after: doubles.after }));
vi.mock("@/lib/onboarding/site/servico", () => ({
  recuperarLeiturasDoSite: doubles.recuperar,
  reenfileirarSite: doubles.reenfileirar,
  enfileirarSiteDoAcervo: doubles.enfileirarAcervo,
  processarFonteDoSite: doubles.processar,
}));

import { GET as cron } from "@/app/api/v1/cron/onboarding-sites/route";
import { POST as retry } from "@/app/api/v1/onboarding/site/retry/route";
import { POST as adicionarSite } from "@/app/api/v1/ai/knowledge/sources/site/route";
import { POST as relerSite } from "@/app/api/v1/ai/knowledge/sources/site/retry/route";

beforeEach(() => {
  vi.clearAllMocks();
  doubles.secrets.INTERNAL_SECRET = "segredo-local-do-teste";
  doubles.secrets.INTERNAL_CRON_SECRET = "";
  doubles.recuperar.mockResolvedValue({ enfileiradas: 1, processadas: 1 });
  doubles.requireRole.mockResolvedValue({ ok: true, org: { orgId: "org-confiavel" }, user: { idioma: "pt-BR" } });
  doubles.reenfileirar.mockResolvedValue(true);
  doubles.enfileirarAcervo.mockResolvedValue(sourceId);
});

describe("site no acervo", () => {
  it("usa a organização do guard, enfileira sem esperar rede e processa em after", async () => {
    const response = await adicionarSite(new NextRequest("http://localhost/api/v1/ai/knowledge/sources/site", {
      method: "POST", body: JSON.stringify({ url: "https://clinica.example/" }),
    }));
    expect(response.status).toBe(201);
    expect(doubles.enfileirarAcervo).toHaveBeenCalledWith("org-confiavel", "https://clinica.example/");
    expect(doubles.processar).not.toHaveBeenCalled();
    await doubles.after.mock.calls[0]![0]();
    expect(doubles.processar).toHaveBeenCalledWith("org-confiavel", sourceId);
  });

  it("releitura da biblioteca usa a fonte pedida, sem aceitar tenant no body", async () => {
    expect((await relerSite(request({ source_id: sourceId, organization_id: "outra" }))).status).toBe(422);
    const response = await relerSite(request({ source_id: sourceId }));
    expect(response.status).toBe(200);
    expect(doubles.reenfileirar).toHaveBeenCalledWith("org-confiavel", sourceId);
  });
});

describe("fila de leitura do site", () => {
  it.each([undefined, "Bearer errado", "segredo-local-do-teste"])("recusa auth %s antes de consultar o banco", async (authorization) => {
    const response = await cron(new NextRequest("http://localhost/api/v1/cron/onboarding-sites", {
      headers: authorization ? { authorization } : {},
    }));
    expect(response.status).toBe(403);
    expect(doubles.recuperar).not.toHaveBeenCalled();
  });

  it("sem segredo configurado falha fechado; com o segredo correto recupera fila", async () => {
    doubles.secrets.INTERNAL_SECRET = "";
    expect((await cron(new NextRequest("http://localhost/api/v1/cron/onboarding-sites"))).status).toBe(403);
    doubles.secrets.INTERNAL_CRON_SECRET = "cron-test";
    const response = await cron(new NextRequest("http://localhost/api/v1/cron/onboarding-sites", { headers: { authorization: "Bearer cron-test" } }));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ enfileiradas: 1, processadas: 1 });
    expect(doubles.recuperar).toHaveBeenCalledTimes(1);
  });

  it("falha de persistência vira 503, nunca fila falsamente concluída", async () => {
    doubles.recuperar.mockRejectedValue(new Error("erro contendo dado que não deve sair"));
    const response = await cron(new NextRequest("http://localhost/api/v1/cron/onboarding-sites", { headers: { authorization: "Bearer segredo-local-do-teste" } }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("dado que não deve sair");
  });

  it("scheduler da VPS e relógio de desenvolvimento realmente incluem a fila", () => {
    const scheduler = readFileSync("docker/scheduler/entrypoint.sh", "utf8");
    expect(scheduler).toMatch(/^\* \* \* \* \*\|60\|api\/v1\/cron\/onboarding-sites$/m);
    expect(readFileSync("scripts/dev-crons.ts", "utf8")).toContain('"/api/v1/cron/onboarding-sites"');
  });
});

const sourceId = "96683f81-d67d-4c40-b0d4-de02a62c4dbd";
const request = (body: unknown) => new NextRequest("http://localhost/api/v1/onboarding/site/retry", { method: "POST", body: JSON.stringify(body) });
describe("tentar ler de novo", () => {
  it("nega papel sem autorização antes de tocar a fila", async () => {
    doubles.requireRole.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await retry(request({ source_id: sourceId }))).status).toBe(403);
    expect(doubles.reenfileirar).not.toHaveBeenCalled();
  });
  it("não aceita tenant no body", async () => {
    expect((await retry(request({ source_id: sourceId, organization_id: "outra-org" }))).status).toBe(422);
    expect(doubles.reenfileirar).not.toHaveBeenCalled();
  });
  it("usa org do guard e retorna antes da leitura externa", async () => {
    expect((await retry(request({ source_id: sourceId }))).status).toBe(200);
    expect(doubles.requireRole).toHaveBeenCalledWith("manager", expect.objectContaining({ resource: "ai_knowledge" }));
    expect(doubles.reenfileirar).toHaveBeenCalledWith("org-confiavel", sourceId);
    expect(doubles.processar).not.toHaveBeenCalled();
    expect(doubles.after).toHaveBeenCalledTimes(1);
    await doubles.after.mock.calls[0]![0]();
    expect(doubles.processar).toHaveBeenCalledWith("org-confiavel", sourceId);
  });
  it("não reinicia leitura em andamento, revisada ou esgotada", async () => {
    doubles.reenfileirar.mockResolvedValue(false);
    expect((await retry(request({ source_id: sourceId }))).status).toBe(409);
    expect(doubles.after).not.toHaveBeenCalled();
  });
});
