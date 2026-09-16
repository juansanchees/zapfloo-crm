// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lerCampanhas, lerInsights, listarContas } from "@/lib/plataformas-de-anuncio/meta/insights";

const log = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: log }));
const TOKEN = "token-totalmente-ficticio-da-suite";
const PROVA = "prova-ficticia-que-nao-pode-virar-url";
const BASE = "https://graph.facebook.com/v22.0/me/adaccounts";
const conta = { account_id: "123", name: "Conta fictícia", currency: "BRL", account_status: 1 };
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => { vi.clearAllMocks(); fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function pagina(data: unknown[] = [conta], next?: string) {
  return Response.json({ data, ...(next ? { paging: { next } } : {}) });
}

describe("transporte de leitura de contas e anúncios", () => {
  it("paginação usa somente header; remove token e prova antes do próximo fetch", async () => {
    fetchMock.mockResolvedValueOnce(pagina([conta], `${BASE}?after=pagina2&access_token=${TOKEN}&appsecret_proof=${PROVA}`));
    fetchMock.mockResolvedValueOnce(pagina([{ ...conta, account_id: "456" }]));
    const resposta = await listarContas(TOKEN);
    expect(resposta).toMatchObject({ ok: true, dados: [{ id: "act_123" }, { id: "act_456" }] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [input, init] of fetchMock.mock.calls) {
      const url = new URL(String(input));
      expect(url.protocol).toBe("https:");
      expect(url.hostname).toBe("graph.facebook.com");
      expect(url.username).toBe(""); expect(url.password).toBe("");
      expect(url.href).not.toContain(TOKEN); expect(url.href).not.toContain(PROVA);
      expect(url.searchParams.has("access_token")).toBe(false);
      expect(url.searchParams.has("appsecret_proof")).toBe(false);
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${TOKEN}`);
    }
    expect(new URL(String(fetchMock.mock.calls[1]![0])).searchParams.get("after")).toBe("pagina2");
  });
  it("não segue redirecionamento mesmo vindo do host permitido", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 302, headers: { location: "https://destino.example" } }));
    expect(await listarContas(TOKEN)).toMatchObject({ ok: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![1]?.redirect).toBe("error");
  });
  it.each([
    "https://destino.example/coleta", "http://graph.facebook.com/v22.0/me/adaccounts",
    "https://graph.facebook.com:8443/v22.0/me/adaccounts", "https://usuario:senha@graph.facebook.com/v22.0/me/adaccounts",
    "https://graph.facebook.com.destino.example/coleta", "https://graph.facebook.com@destino.example/coleta",
    "http://127.0.0.1:5432", "//graph.facebook.com/v22.0/me/adaccounts", "não-é-url",
  ])("nega paginação fora da origem estrita: %s", async (next) => {
    fetchMock.mockResolvedValueOnce(pagina([conta], next));
    fetchMock.mockResolvedValueOnce(pagina());
    const resposta = await listarContas(TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resposta).toMatchObject({ ok: false, falha: "transitorio" });
    expect(JSON.stringify(resposta)).not.toContain(next);
  });
  it.each(["access_token", "appsecret_proof", "ACCESS_TOKEN", "appsecret%5fproof"])("remove parâmetro sensível %s independentemente da grafia codificada", async (chave) => {
    fetchMock.mockResolvedValueOnce(pagina([conta], `${BASE}?${chave}=${PROVA}&after=pagina2`));
    fetchMock.mockResolvedValueOnce(pagina([]));
    expect(await listarContas(TOKEN)).toMatchObject({ ok: true });
    expect(String(fetchMock.mock.calls[1]![0])).not.toContain(PROVA);
  });
  it("erro de rede não devolve URL nem mensagem bruta e não repete", async () => {
    fetchMock.mockRejectedValueOnce(new Error(`socket ${BASE}?access_token=${TOKEN}`));
    const resultado = await listarContas(TOKEN);
    expect(resultado).toMatchObject({ ok: false, falha: "transitorio" });
    expect(JSON.stringify(resultado)).not.toContain(TOKEN);
    expect(JSON.stringify(resultado)).not.toContain(BASE);
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain(TOKEN);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([[190, "token_invalido"], [200, "permissao_insuficiente"], [613, "limite_de_chamadas"], [100, "campo_invalido"]])("erro %s mantém classificação sem expor mensagem do provedor", async (code, falha) => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: { code, message: `token ${TOKEN}, prova ${PROVA}` } }, { status: 400 }));
    const resultado = await listarContas(TOKEN);
    expect(resultado).toMatchObject({ ok: false, falha });
    expect(JSON.stringify(resultado)).not.toContain(TOKEN);
    expect(JSON.stringify(resultado)).not.toContain(PROVA);
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain(TOKEN);
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain(PROVA);
  });
  it("erro HTML também não é repassado", async () => {
    fetchMock.mockResolvedValueOnce(new Response(`<html>falhou ${TOKEN}</html>`, { status: 502 }));
    const resultado = await listarContas(TOKEN);
    expect(resultado).toMatchObject({ ok: false, falha: "transitorio" });
    expect(JSON.stringify(resultado)).not.toContain(TOKEN);
    expect(JSON.stringify(resultado)).not.toContain("<html>");
  });
  it("erro durante o body não expõe a mensagem original", async () => {
    fetchMock.mockResolvedValueOnce(new Response(new ReadableStream({ start(controller) {
      controller.error(new Error(`corpo interrompido com ${TOKEN}`));
    } })));
    const resultado = await listarContas(TOKEN);
    expect(resultado).toMatchObject({ ok: false, falha: "transitorio" });
    expect(JSON.stringify(resultado)).not.toContain(TOKEN);
  });
  it.each(["null", "{}", '{"data":"inválido"}', '{"data":[null]}'])("resposta inválida não vira lista vazia nem lança: %s", async (texto) => {
    fetchMock.mockResolvedValueOnce(new Response(texto));
    await expect(listarContas(TOKEN)).resolves.toMatchObject({ ok: false, falha: "transitorio" });
  });
  it("o teto de páginas não apresenta lista parcial como completa", async () => {
    fetchMock.mockImplementation(async () => pagina([conta], `${BASE}?after=continua`));
    expect(await listarContas(TOKEN)).toEqual({ ok: false, falha: "transitorio", detalhe: "pagination_limit" });
    expect(fetchMock).toHaveBeenCalledTimes(20);
  });
  it("as mesmas proteções alcançam campanhas e insights, sem mudar o formato de sucesso", async () => {
    fetchMock.mockResolvedValueOnce(pagina([{ id: "campanha-1", name: "Campanha fictícia" }]));
    expect(await lerCampanhas(TOKEN, "act_123")).toEqual({ ok: true, dados: [{ id: "campanha-1", name: "Campanha fictícia" }] });
    fetchMock.mockResolvedValueOnce(pagina([{ campaign_id: "campanha-1", spend: "1.50" }]));
    expect(await lerInsights(TOKEN, "act_123", "2026-09-01", "2026-09-15")).toEqual({ ok: true, dados: [{ campaign_id: "campanha-1", spend: "1.50" }] });
    for (const [, init] of fetchMock.mock.calls) expect(init?.redirect).toBe("error");
  });
});

describe("orçamento único de 20 segundos para listarContas", () => {
  it("resposta em 12s chega sem repetir a leitura", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(pagina()), 12_000)));
    const pendente = listarContas(TOKEN);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(await pendente).toMatchObject({ ok: true, dados: [{ id: "act_123" }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("duas páginas de 12s não ganham 20s cada; falha aos 20s totais", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(pagina([conta], `${BASE}?after=pagina2`)), 12_000)));
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve(pagina([{ ...conta, account_id: "456" }])), 12_000)));
    const terminado = vi.fn();
    const pendente = listarContas(TOKEN).then((resultado) => { terminado(resultado); return resultado; });
    await vi.advanceTimersByTimeAsync(19_999);
    expect(terminado).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(terminado).toHaveBeenCalledTimes(1);
    expect(await pendente).toMatchObject({ ok: false, falha: "transitorio" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]![1]?.signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("body lento também consome o orçamento global", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(new Response(new ReadableStream({ start(controller) {
      setTimeout(() => { controller.enqueue(new TextEncoder().encode('{"data":[]}')); controller.close(); }, 25_000);
    } })));
    const terminado = vi.fn();
    const pendente = listarContas(TOKEN).then((resultado) => { terminado(resultado); return resultado; });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(terminado).toHaveBeenCalledTimes(1);
    expect(await pendente).toMatchObject({ ok: false, falha: "transitorio" });
    expect(fetchMock.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
