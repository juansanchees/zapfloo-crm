// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), audit: vi.fn(), limite: vi.fn(), cifrar: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://crm.exemplo.invalid" } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mock.from, rpc: mock.rpc }) }));
vi.mock("@/lib/audit", () => ({ audit: mock.audit }));
vi.mock("@/lib/auth/rate-limit", () => ({ authRateLimited: mock.limite }));
vi.mock("@/lib/webhooks/secrets", () => ({ encryptWebhookSecret: mock.cifrar }));

import {
  criarLinkDeConexao, guardarConexaoOAuth, iniciarConexao, lerLinkAutorizado,
  lerPaginaDoLink, limitarOAuth,
} from "@/lib/plataformas-de-anuncio/meta/oauth/servico";
import {
  assinarLink, VALIDADE_ESTADO_MS, VALIDADE_LINK_MS, verificarEstado, verificarLink,
} from "@/lib/plataformas-de-anuncio/meta/oauth/estado";

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "33333333-3333-4333-8333-333333333333";
const PEDIDO = "55555555-5555-4555-8555-555555555555";
const TOKEN = "token-sintetico-do-servico-nao-real";
type Resposta = { data: unknown; error: unknown };
const respostas = new Map<string, Resposta>();
function novaQuery(tabela: string) {
  return {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => respostas.get(tabela) ?? { data: null, error: null }),
  };
}
const queries = new Map<string, ReturnType<typeof novaQuery>>();
function linha() {
  return { id: PEDIDO, organization_id: ORG, user_id: USER,
    expires_at: new Date(Date.now() + 20 * 60_000).toISOString(),
    consumed_at: null, revoked_at: null, kind: "link" };
}
function link() {
  const token = assinarLink({ requestId: PEDIDO, expiresAt: Date.parse(linha().expires_at) });
  if (!token) throw new Error("A fixture exige assinatura real válida");
  return token;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-15T15:00:00Z"));
  vi.stubEnv("INTERNAL_SECRET", "segredo-sintetico-oauth-hmac-de-teste-com-mais-de-32");
  vi.stubEnv("META_APP_ID", "123456");
  vi.stubEnv("META_APP_SECRET", "app-secret-sintetico");
  vi.stubEnv("META_LOGIN_CONFIG_ID", "987654");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://crm.exemplo.invalid");
  respostas.clear(); queries.clear();
  respostas.set("ad_insights_oauth_requests", { data: linha(), error: null });
  respostas.set("user_organizations", { data: { role: "manager" }, error: null });
  respostas.set("organizations", { data: { display_name: "Organização de teste" }, error: null });
  mock.from.mockImplementation((tabela: string) => {
    const query = novaQuery(tabela); queries.set(tabela, query); return query;
  });
  mock.rpc.mockResolvedValue({ data: { status: "ok", id: PEDIDO, expires_at: new Date(Date.now() + 9 * 60_000).toISOString() }, error: null });
  mock.audit.mockResolvedValue(undefined);
  mock.limite.mockResolvedValue(false);
  mock.cifrar.mockResolvedValue("\\xcafef00d");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("serviço OAuth de anúncios — leitura pública por capacidade", () => {
  it("assinatura inválida não consulta nenhuma tabela", async () => {
    const token = link();
    const alterado = token.slice(0, -1) + (token.endsWith("0") ? "1" : "0");
    expect(await lerPaginaDoLink(alterado)).toEqual({ ok: false });
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("nome público só sai após escopo do recibo e papel atual; IDs e credenciais não saem", async () => {
    const pagina = await lerPaginaDoLink(link());
    expect(pagina).toEqual({ ok: true, nome: "Organização de teste" });
    expect(queries.get("ad_insights_oauth_requests")!.eq).toHaveBeenCalledWith("id", PEDIDO);
    expect(queries.get("ad_insights_oauth_requests")!.eq).toHaveBeenCalledWith("kind", "link");
    const membro = queries.get("user_organizations")!;
    expect(membro.eq).toHaveBeenCalledWith("organization_id", ORG);
    expect(membro.eq).toHaveBeenCalledWith("user_id", USER);
    expect(membro.is).toHaveBeenCalledWith("revoked_at", null);
    expect(membro.not).toHaveBeenCalledWith("accepted_at", "is", null);
    const org = queries.get("organizations")!;
    expect(org.select).toHaveBeenCalledExactlyOnceWith("display_name");
    expect(org.eq).toHaveBeenCalledWith("id", ORG);
    expect(org.eq).toHaveBeenCalledWith("status", "active");
    expect(org.is).toHaveBeenCalledWith("suspended_at", null);
    expect(org.is).toHaveBeenCalledWith("redacted_at", null);
    expect(mock.from).not.toHaveBeenCalledWith("ad_insights_connections");
    expect(JSON.stringify(pagina)).not.toContain(ORG);
    expect(JSON.stringify(pagina)).not.toContain(USER);
  });

  it.each([
    ["consumido", { consumed_at: "2026-09-15T15:00:00Z" }],
    ["revogado", { revoked_at: "2026-09-15T15:00:00Z" }],
    ["prazo diferente da assinatura", { expires_at: "2026-09-15T15:15:00Z" }],
    ["outro tipo de solicitação", { kind: "session" }],
  ] as const)("recibo %s não deixa o nome vazar", async (_caso, campos) => {
    respostas.set("ad_insights_oauth_requests", { data: { ...linha(), ...campos }, error: null });
    expect(await lerPaginaDoLink(link())).toEqual({ ok: false });
    expect(mock.from).not.toHaveBeenCalledWith("organizations");
  });

  it("link vencido continua recusado mesmo se a resposta falsa do banco disser pendente", async () => {
    const token = link();
    vi.advanceTimersByTime(21 * 60_000);
    expect(await lerLinkAutorizado(token)).toBeNull();
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("emissor removido ou rebaixado não mantém poder no link emitido", async () => {
    respostas.set("user_organizations", { data: { role: "viewer" }, error: null });
    expect(await lerPaginaDoLink(link())).toEqual({ ok: false });
    expect(mock.from).not.toHaveBeenCalledWith("organizations");
    const plataforma = queries.get("platform_admins")!;
    expect(plataforma.eq).toHaveBeenCalledWith("user_id", USER);
    expect(plataforma.eq).toHaveBeenCalledWith("scope", "full");
    expect(plataforma.is).toHaveBeenCalledWith("revoked_at", null);
  });

  it.each(["ad_insights_oauth_requests", "user_organizations", "organizations"])("falha retornada pelo banco em %s fecha a página", async (tabela) => {
    respostas.set(tabela, { data: null, error: { message: "indisponível" } });
    expect(await lerPaginaDoLink(link())).toEqual({ ok: false });
  });

  it("sem organização ativa não há nome nem formulário a autorizar", async () => {
    respostas.set("organizations", { data: null, error: null });
    expect(await lerPaginaDoLink(link())).toEqual({ ok: false });
  });
});

describe("serviço OAuth de anúncios — emissão e gravação", () => {
  it.each([1, 32_000, -32_000])("link tolera relógio do banco deslocado em %ims sem ampliar o prazo", async (deslocamento) => {
    const inicio = Date.now();
    const prazoDoBanco = inicio + VALIDADE_LINK_MS + deslocamento;
    const prazoEfetivo = Math.min(prazoDoBanco, inicio + VALIDADE_LINK_MS);
    mock.rpc.mockResolvedValue({ data: { status: "ok", id: PEDIDO, expires_at: new Date(prazoDoBanco).toISOString() }, error: null });
    const resultado = await criarLinkDeConexao(ORG, USER);
    expect(resultado).not.toBeNull();
    const token = new URL(resultado!.url).pathname.split("/").at(-1)!;
    expect(verificarLink(token)?.expiresAt).toBe(prazoEfetivo);
    expect(resultado!.expires_at).toBe(new Date(prazoEfetivo).toISOString());
    expect(mock.audit).toHaveBeenCalledWith(expect.objectContaining({ metadata: { expires_at: resultado!.expires_at } }));
    respostas.set("ad_insights_oauth_requests", { data: { ...linha(), expires_at: new Date(prazoDoBanco).toISOString() }, error: null });
    expect(await lerLinkAutorizado(token)).not.toBeNull();
  });

  it.each([1, 32_000, -32_000])("sessão tolera relógio do banco deslocado em %ims sem ampliar o prazo", async (deslocamento) => {
    const inicio = Date.now();
    const prazoDoBanco = inicio + VALIDADE_ESTADO_MS + deslocamento;
    mock.rpc.mockResolvedValue({ data: { status: "ok", id: PEDIDO, expires_at: new Date(prazoDoBanco).toISOString() }, error: null });
    const resultado = await iniciarConexao(ORG, USER, PEDIDO);
    expect(resultado).not.toBeNull();
    const state = new URL(resultado!.url).searchParams.get("state");
    const esperado = Math.min(prazoDoBanco, inicio + VALIDADE_ESTADO_MS);
    expect(verificarEstado(state)?.expiresAt).toBe(esperado);
    expect(mock.audit).toHaveBeenCalledWith(expect.objectContaining({ metadata: {
      origin: "agency", expires_at: new Date(esperado).toISOString(),
    } }));
    expect(verificarEstado(state, new Date(esperado - 1))).not.toBeNull();
    expect(verificarEstado(state, new Date(esperado))).toBeNull();
  });

  it("31 minutos no recibo viram no máximo 30, sem afrouxar o assinador", async () => {
    const inicio = Date.now();
    const prazoDoBanco = inicio + 31 * 60_000;
    expect(assinarLink({ requestId: PEDIDO, expiresAt: prazoDoBanco })).toBeNull();
    mock.rpc.mockResolvedValue({ data: { status: "ok", id: PEDIDO, expires_at: new Date(prazoDoBanco).toISOString() }, error: null });
    const resultado = await criarLinkDeConexao(ORG, USER);
    expect(resultado).not.toBeNull();
    const token = new URL(resultado!.url).pathname.split("/").at(-1)!;
    const prazoEfetivo = inicio + VALIDADE_LINK_MS;
    expect(verificarLink(token)?.expiresAt).toBe(prazoEfetivo);
    expect(verificarLink(token, new Date(prazoEfetivo - 1))).not.toBeNull();
    expect(verificarLink(token, new Date(prazoEfetivo))).toBeNull();
  });

  it("prazo assinado menor é aceito, mas um recibo menor que o assinado recusa o acesso", async () => {
    const token = link(); // assinado por 20 minutos
    respostas.set("ad_insights_oauth_requests", { data: { ...linha(), expires_at: new Date(Date.now() + 25 * 60_000).toISOString() }, error: null });
    expect(await lerLinkAutorizado(token)).not.toBeNull();
    respostas.set("ad_insights_oauth_requests", { data: { ...linha(), expires_at: new Date(Date.now() + 15 * 60_000).toISOString() }, error: null });
    expect(await lerLinkAutorizado(token)).toBeNull();
  });

  it.each(["link", "sessao"])("latência da RPC não renova a janela do %s", async (tipo) => {
    const inicio = Date.now();
    const ttl = tipo === "link" ? VALIDADE_LINK_MS : VALIDADE_ESTADO_MS;
    mock.rpc.mockImplementationOnce(async () => {
      vi.advanceTimersByTime(12_000);
      return { data: { status: "ok", id: PEDIDO, expires_at: new Date(Date.now() + ttl + 32_000).toISOString() }, error: null };
    });
    if (tipo === "link") {
      const resultado = await criarLinkDeConexao(ORG, USER);
      expect(resultado).not.toBeNull();
      expect(resultado!.expires_at).toBe(new Date(inicio + ttl).toISOString());
      const token = new URL(resultado!.url).pathname.split("/").at(-1)!;
      expect(verificarLink(token)?.expiresAt).toBe(inicio + ttl);
    } else {
      const resultado = await iniciarConexao(ORG, USER);
      expect(resultado).not.toBeNull();
      expect(verificarEstado(new URL(resultado!.url).searchParams.get("state"))?.expiresAt).toBe(inicio + ttl);
    }
  });

  it.each(["link", "sessao"])("RPC que chega depois do prazo não emite %s já vencido", async (tipo) => {
    const ttl = tipo === "link" ? VALIDADE_LINK_MS : VALIDADE_ESTADO_MS;
    mock.rpc.mockImplementationOnce(async () => {
      vi.advanceTimersByTime(ttl);
      return { data: { status: "ok", id: PEDIDO, expires_at: new Date(Date.now() + ttl).toISOString() }, error: null };
    });
    const resultado = tipo === "link" ? await criarLinkDeConexao(ORG, USER) : await iniciarConexao(ORG, USER);
    expect(resultado).toBeNull();
    expect(mock.audit).not.toHaveBeenCalled();
  });

  it("emite link de escopo interno, assinado sem org/ator no payload público, sem token na auditoria", async () => {
    const resultado = await criarLinkDeConexao(ORG, USER);
    expect(resultado).not.toBeNull();
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("fn_ad_insights_oauth_emitir_link", { p_organization_id: ORG, p_user_id: USER });
    const token = new URL(resultado!.url).pathname.split("/").at(-1)!;
    expect(verificarLink(token)).toEqual({ requestId: PEDIDO, expiresAt: Date.parse(resultado!.expires_at) });
    const carga = Buffer.from(token.split(".")[0]!, "base64url").toString("utf8");
    expect(carga).not.toContain(ORG);
    expect(carga).not.toContain(USER);
    expect(JSON.stringify(mock.audit.mock.calls)).not.toContain(token);
  });

  it("iniciar delegação usa RPC com escopo e hash; state real liga ator, org e sessão", async () => {
    const resultado = await iniciarConexao(ORG, USER, PEDIDO);
    expect(resultado).not.toBeNull();
    expect(mock.rpc).toHaveBeenCalledWith("fn_ad_insights_oauth_iniciar", {
      p_organization_id: ORG, p_user_id: USER, p_link_id: PEDIDO,
      p_browser_digest: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    const url = new URL(resultado!.url);
    const estado = verificarEstado(url.searchParams.get("state"));
    expect(estado).toEqual(expect.objectContaining({ organizationId: ORG, userId: USER, requestId: PEDIDO }));
    expect(url.origin).toBe("https://www.facebook.com");
    expect(JSON.stringify(mock.audit.mock.calls)).not.toContain(resultado!.vinculo);
    expect(JSON.stringify(mock.rpc.mock.calls)).not.toContain(resultado!.vinculo);
  });

  it.each(["fn_ad_insights_oauth_emitir_link", "fn_ad_insights_oauth_iniciar"])("recibo de %s recusado ou indisponível não emite autoridade", async (nome) => {
    mock.rpc.mockResolvedValue({ data: { status: "request_unavailable" }, error: null });
    const executar = () => nome.endsWith("emitir_link") ? criarLinkDeConexao(ORG, USER) : iniciarConexao(ORG, USER, PEDIDO);
    expect(await executar()).toBeNull();
    mock.rpc.mockResolvedValue({ data: null, error: { message: "indisponível" } });
    expect(await executar()).toBeNull();
    expect(mock.audit).not.toHaveBeenCalled();
  });

  it("falta de configuração impede iniciar uma sessão", async () => {
    vi.stubEnv("META_LOGIN_CONFIG_ID", "");
    expect(await iniciarConexao(ORG, USER)).toBeNull();
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("conclusão recebe somente token cifrado e escopo do callback; recusa do banco não vira sucesso", async () => {
    const dados = { organizationId: ORG, requestId: PEDIDO, browserDigest: "a".repeat(64), accessToken: TOKEN,
      tokenType: "SYSTEM_USER", tokenExpiresAt: null, dataAccessExpiresAt: "2026-10-01T00:00:00Z", checkedAt: "2026-09-15T15:00:00Z" };
    expect(await guardarConexaoOAuth(dados)).toBe(true);
    expect(mock.cifrar).toHaveBeenCalledWith(expect.anything(), TOKEN);
    expect(mock.rpc).toHaveBeenCalledWith("fn_ad_insights_oauth_concluir", {
      p_organization_id: ORG, p_request_id: PEDIDO, p_browser_digest: dados.browserDigest,
      p_access_token_encrypted: "\\xcafef00d", p_default_account_id: null,
      p_token_expires_at: null, p_data_access_expires_at: dados.dataAccessExpiresAt,
      p_token_type: "SYSTEM_USER", p_token_checked_at: dados.checkedAt,
    });
    expect(JSON.stringify(mock.rpc.mock.calls)).not.toContain(TOKEN);
    mock.rpc.mockResolvedValue({ data: { status: "request_unavailable" }, error: null });
    expect(await guardarConexaoOAuth(dados)).toBe(false);
    mock.rpc.mockResolvedValue({ data: null, error: { message: "indisponível" } });
    expect(await guardarConexaoOAuth(dados)).toBe(false);
    mock.rpc.mockClear(); mock.cifrar.mockResolvedValue(null);
    expect(await guardarConexaoOAuth(dados)).toBe(false);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("erro do contador fecha a entrada, sem permitir tentativa irrestrita", async () => {
    mock.limite.mockRejectedValue(new Error("contador indisponível"));
    expect(await limitarOAuth("link", "capacidade-de-teste")).toBe(true);
  });
});
