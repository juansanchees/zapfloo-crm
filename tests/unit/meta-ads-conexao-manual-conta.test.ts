// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  loadAuthUser: vi.fn(), resolveActiveOrg: vi.fn(), mfa: vi.fn(),
  roleRpc: vi.fn(), createAdmin: vi.fn(), from: vi.fn(), select: vi.fn(),
  eq: vi.fn(), maybeSingle: vi.fn(), rpc: vi.fn(),
  encrypt: vi.fn(), decrypt: vi.fn(), listarContas: vi.fn(), limitar: vi.fn(),
  audit: vi.fn(), revalidate: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-request-id": "meta-ads-unitario" }) }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://crm.exemplo.invalid" } }));
vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: mock.loadAuthUser, resolveActiveOrg: mock.resolveActiveOrg, mfaEmDivida: mock.mfa,
}));
// requireRole é REAL: o papel efetivo vem da RPC abaixo, não de um guard sempre verde.
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mock.roleRpc }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mock.createAdmin }));
vi.mock("@/lib/webhooks/secrets", () => ({ encryptWebhookSecret: mock.encrypt, decryptWebhookSecret: mock.decrypt }));
vi.mock("@/lib/plataformas-de-anuncio/meta/insights", () => ({ listarContas: mock.listarContas }));
vi.mock("@/lib/plataformas-de-anuncio/meta/oauth/servico", () => ({ limitarOAuth: mock.limitar }));
vi.mock("@/lib/audit", () => ({ audit: mock.audit }));

import {
  disconnectAdInsights,
  updateAdInsightsConnection,
} from "@/app/actions/settings/updateAdInsightsConnection";
import { PATCH } from "@/app/api/v1/ads/meta/account/route";

const ORIGEM = "https://crm.exemplo.invalid";
const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const OUTRA_ORG = "33333333-3333-4333-8333-333333333333";
const OUTRO_USER = "44444444-4444-4444-8444-444444444444";
const TOKEN = "token-ficticio-de-anuncios-unitario-nao-real";
const CIFRADO = "\\x746f6b656e2d6369667261646f2d666963746963696f";
const CONTA = "act_12345";
const query = { select: mock.select, eq: mock.eq, maybeSingle: mock.maybeSingle };
const admin = { from: mock.from, rpc: mock.rpc };

function usuario(platformAdmin = false) {
  return { id: USER, is_platform_admin: platformAdmin, idioma: "pt-BR", organizations: [] };
}

function papel(role: "viewer" | "agent" | "manager" | "admin", platformAdmin = false) {
  mock.loadAuthUser.mockResolvedValue(usuario(platformAdmin));
  mock.resolveActiveOrg.mockResolvedValue({ orgId: ORG, name: "Organização fictícia", role });
  mock.roleRpc.mockResolvedValue({ data: role, error: null });
}

function requisicao(body: unknown = { default_account_id: CONTA }, origin: string | null = ORIGEM) {
  return new NextRequest(`${ORIGEM}/api/v1/ads/meta/account?organization_id=${OUTRA_ORG}&user_id=${OUTRO_USER}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function semSegredos(resultado: unknown) {
  const exposto = JSON.stringify({ resultado, audit: mock.audit.mock.calls, revalidate: mock.revalidate.mock.calls });
  expect(exposto).not.toContain(TOKEN);
  expect(exposto).not.toContain(CIFRADO);
}

beforeEach(() => {
  vi.resetAllMocks();
  papel("admin");
  mock.mfa.mockResolvedValue(false);
  mock.createAdmin.mockReturnValue(admin);
  mock.from.mockReturnValue(query);
  mock.select.mockReturnValue(query);
  mock.eq.mockReturnValue(query);
  mock.maybeSingle.mockResolvedValue({ data: { id: "conexao-ficticia", access_token_encrypted: CIFRADO }, error: null });
  mock.rpc.mockResolvedValue({ data: { status: "ok" }, error: null });
  mock.encrypt.mockResolvedValue(CIFRADO);
  mock.decrypt.mockResolvedValue(TOKEN);
  mock.listarContas.mockResolvedValue({ ok: true, dados: [{ id: CONTA, nome: "Conta fictícia" }] });
  mock.limitar.mockResolvedValue(false);
  mock.audit.mockResolvedValue(undefined);
});

describe("conexão manual de anúncios — compatibilidade e transação", () => {
  it("cifra o token e grava pela RPC somente com organização/ator autenticados", async () => {
    mock.maybeSingle.mockResolvedValue({ data: null, error: null });
    const entrada = {
      platform: "meta_ads" as const, access_token: TOKEN, default_account_id: CONTA,
      organization_id: OUTRA_ORG, user_id: OUTRO_USER,
    };
    const resultado = await updateAdInsightsConnection(entrada);

    expect(resultado).toEqual({ ok: true });
    expect(mock.from).toHaveBeenCalledExactlyOnceWith("ad_insights_connections");
    expect(mock.select).toHaveBeenCalledExactlyOnceWith("id");
    expect(mock.eq.mock.calls).toEqual([["organization_id", ORG], ["platform", "meta_ads"]]);
    expect(mock.encrypt).toHaveBeenCalledExactlyOnceWith(admin, TOKEN);
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("fn_ad_insights_mutar_conexao", {
      p_organization_id: ORG, p_user_id: USER, p_operation: "save",
      p_access_token_encrypted: CIFRADO, p_default_account_id: CONTA, p_alterar_conta: true,
    });
    expect(mock.audit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      action: "ad_insights_connection.updated", actorUserId: USER, organizationId: ORG,
      metadata: { platform: "meta_ads", default_account_id: CONTA, token_trocado: true, primeira_conexao: true },
    }));
    expect(mock.revalidate.mock.calls).toEqual([["/app/settings/meta-ads"], ["/app/ads/meta"]]);
    semSegredos(resultado);
  });

  it("preserva o token legado ao trocar a conta sem redigitar a credencial", async () => {
    const resultado = await updateAdInsightsConnection({ platform: "meta_ads", default_account_id: CONTA });
    expect(resultado).toEqual({ ok: true });
    expect(mock.encrypt).not.toHaveBeenCalled();
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("fn_ad_insights_mutar_conexao", {
      p_organization_id: ORG, p_user_id: USER, p_operation: "save",
      p_access_token_encrypted: null, p_default_account_id: CONTA, p_alterar_conta: true,
    });
    expect(mock.audit).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ token_trocado: false, primeira_conexao: false }) }));
  });

  it("conta omitida não é apagada; null explícito é repassado como alteração", async () => {
    expect(await updateAdInsightsConnection({ platform: "meta_ads" })).toEqual({ ok: true });
    expect(mock.rpc).toHaveBeenNthCalledWith(1, "fn_ad_insights_mutar_conexao", expect.objectContaining({ p_default_account_id: null, p_alterar_conta: false }));
    expect(await updateAdInsightsConnection({ platform: "meta_ads", default_account_id: null })).toEqual({ ok: true });
    expect(mock.rpc).toHaveBeenNthCalledWith(2, "fn_ad_insights_mutar_conexao", expect.objectContaining({ p_default_account_id: null, p_alterar_conta: true }));
  });

  it("primeira conexão sem token recusa antes de cifrar, gravar ou anunciar sucesso", async () => {
    mock.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await updateAdInsightsConnection({ platform: "meta_ads", default_account_id: CONTA })).toMatchObject({ ok: false, error: "validation_failed" });
    expect(mock.encrypt).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.audit).not.toHaveBeenCalled();
    expect(mock.revalidate).not.toHaveBeenCalled();
  });

  it("falha de leitura não é confundida com primeira conexão", async () => {
    mock.maybeSingle.mockResolvedValue({ data: null, error: { message: "banco fictício indisponível" } });
    expect(await updateAdInsightsConnection({ platform: "meta_ads", access_token: TOKEN })).toMatchObject({ ok: false, error: "erro_ao_gravar" });
    expect(mock.encrypt).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.audit).not.toHaveBeenCalled();
  });

  it("cifra indisponível nunca salva plaintext nem anuncia conexão concluída", async () => {
    mock.encrypt.mockResolvedValue(null);
    const resultado = await updateAdInsightsConnection({ platform: "meta_ads", access_token: TOKEN });
    expect(resultado).toEqual({ ok: false, error: "cifra_indisponivel" });
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.audit).not.toHaveBeenCalled();
    expect(mock.revalidate).not.toHaveBeenCalled();
    semSegredos(resultado);
  });

  it.each([
    ["erro de banco", { data: null, error: { message: TOKEN } }],
    ["recusa transacional", { data: { status: "connection_changed" }, error: null }],
    ["recibo ausente", { data: null, error: null }],
  ])("save com %s falha fechado sem devolver bearer", async (_nome, resposta) => {
    mock.rpc.mockResolvedValue(resposta);
    const resultado = await updateAdInsightsConnection({ platform: "meta_ads", access_token: TOKEN });
    expect(resultado).toEqual({ ok: false, error: "erro_ao_gravar" });
    expect(mock.audit).not.toHaveBeenCalled();
    expect(mock.revalidate).not.toHaveBeenCalled();
    semSegredos(resultado);
  });

  it("desconectar chama a RPC mesmo sem linha, invalidando consentimentos pendentes", async () => {
    mock.maybeSingle.mockResolvedValue({ data: null, error: null });
    const resultado = await disconnectAdInsights();
    expect(resultado).toEqual({ ok: true });
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("fn_ad_insights_mutar_conexao", {
      p_organization_id: ORG, p_user_id: USER, p_operation: "disconnect",
    });
    expect(mock.audit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ action: "ad_insights_connection.deleted", actorUserId: USER, organizationId: ORG }));
    expect(mock.revalidate.mock.calls).toEqual([["/app/settings/meta-ads"], ["/app/ads/meta"]]);
    semSegredos(resultado);
  });

  it.each([
    { data: null, error: { message: TOKEN } },
    { data: { status: "forbidden" }, error: null },
    { data: null, error: null },
  ])("desconexão recusada não audita exclusão nem devolve segredo (%j)", async (resposta) => {
    mock.rpc.mockResolvedValue(resposta);
    const resultado = await disconnectAdInsights();
    expect(resultado).toEqual({ ok: false, error: "erro_ao_gravar" });
    expect(mock.audit).not.toHaveBeenCalled();
    expect(mock.revalidate).not.toHaveBeenCalled();
    semSegredos(resultado);
  });
});

describe.each([
  ["salvar", () => updateAdInsightsConnection({ platform: "meta_ads", access_token: TOKEN })],
  ["desconectar", disconnectAdInsights],
] as const)("conexão manual — autorização para %s", (_nome, executar) => {
  it.each(["viewer", "agent", "manager"] as const)("recusa %s antes de MFA ou acesso ao banco administrativo", async (role) => {
    papel(role);
    mock.mfa.mockResolvedValue(true);
    expect(await executar()).toEqual({ ok: false, error: "forbidden_role" });
    expect(mock.mfa).not.toHaveBeenCalled();
    expect(mock.createAdmin).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("permite admin da organização sem exigir admin de plataforma", async () => {
    papel("admin");
    expect(await executar()).toEqual({ ok: true });
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });

  it("permite admin de plataforma na organização ativa sem ignorar MFA", async () => {
    papel("viewer", true);
    expect(await executar()).toEqual({ ok: true });
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    mock.rpc.mockClear();
    mock.mfa.mockResolvedValue(true);
    expect(await executar()).toEqual({ ok: false, error: "mfa_required" });
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("admin com MFA em dívida não acessa a conexão", async () => {
    mock.mfa.mockResolvedValue(true);
    expect(await executar()).toEqual({ ok: false, error: "mfa_required" });
    expect(mock.createAdmin).not.toHaveBeenCalled();
  });

  it.each(["sessão", "organização"])("sem %s válida não abre cliente administrativo", async (ausente) => {
    if (ausente === "sessão") mock.loadAuthUser.mockResolvedValue(null);
    else mock.resolveActiveOrg.mockResolvedValue(null);
    expect(await executar()).toEqual({ ok: false, error: ausente === "sessão" ? "unauthenticated" : "forbidden_tenant" });
    expect(mock.createAdmin).not.toHaveBeenCalled();
  });
});

describe("PATCH de conta de anúncios — lista real e compare-and-swap", () => {
  it.each(["manager", "admin"] as const)("%s escolhe conta realmente listada e passa o ciphertext conferido à RPC", async (role) => {
    papel(role);
    const resposta = await PATCH(requisicao());
    const body = await resposta.json();
    expect(resposta.status).toBe(200);
    expect(body).toEqual({ data: { default_account_id: CONTA } });
    expect(mock.roleRpc).toHaveBeenCalledExactlyOnceWith("fn_user_role_in_org", { p_org: ORG });
    expect(mock.from).toHaveBeenCalledExactlyOnceWith("ad_insights_connections");
    expect(mock.select).toHaveBeenCalledExactlyOnceWith("access_token_encrypted");
    expect(mock.eq.mock.calls).toEqual([["organization_id", ORG], ["platform", "meta_ads"]]);
    expect(mock.decrypt).toHaveBeenCalledExactlyOnceWith(admin, CIFRADO);
    expect(mock.listarContas).toHaveBeenCalledExactlyOnceWith(TOKEN);
    expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("fn_ad_insights_mutar_conexao", {
      p_organization_id: ORG, p_user_id: USER, p_operation: "select_account",
      p_default_account_id: CONTA, p_alterar_conta: true, p_expected_token_encrypted: CIFRADO,
    });
    expect(mock.listarContas.mock.invocationCallOrder[0]).toBeLessThan(mock.rpc.mock.invocationCallOrder[0]!);
    expect(mock.audit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      actorUserId: USER, organizationId: ORG,
      metadata: { default_account_id: CONTA, token_trocado: false },
    }));
    expect(resposta.headers.get("cache-control")).toContain("no-store");
    expect(resposta.headers.get("referrer-policy")).toBe("no-referrer");
    semSegredos(body);
  });

  it.each(["viewer", "agent"] as const)("%s é recusado pelo guard real mesmo com um id válido", async (role) => {
    papel(role);
    const resposta = await PATCH(requisicao());
    expect(resposta.status).toBe(403);
    expect(await resposta.json()).toMatchObject({ error: { code: "forbidden_role" } });
    expect(mock.createAdmin).not.toHaveBeenCalled();
    expect(mock.listarContas).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it.each([false, true])("MFA em dívida recusa também platform-admin=%s", async (platformAdmin) => {
    papel(platformAdmin ? "viewer" : "manager", platformAdmin);
    mock.mfa.mockResolvedValue(true);
    const resposta = await PATCH(requisicao());
    expect(resposta.status).toBe(403);
    expect(await resposta.json()).toMatchObject({ error: { code: "mfa_required" } });
    expect(mock.createAdmin).not.toHaveBeenCalled();
    expect(mock.listarContas).not.toHaveBeenCalled();
  });

  it("admin de plataforma pode escolher conta, usando o mesmo escopo confiável", async () => {
    papel("viewer", true);
    expect((await PATCH(requisicao())).status).toBe(200);
    expect(mock.roleRpc).not.toHaveBeenCalled();
    expect(mock.rpc).toHaveBeenCalledWith("fn_ad_insights_mutar_conexao", expect.objectContaining({ p_organization_id: ORG, p_user_id: USER }));
  });

  it.each(["sessão", "organização", "papel efetivo"])("falta de %s recusa antes de consultar o token", async (ausente) => {
    if (ausente === "sessão") mock.loadAuthUser.mockResolvedValue(null);
    else if (ausente === "organização") mock.resolveActiveOrg.mockResolvedValue(null);
    else mock.roleRpc.mockResolvedValue({ data: null, error: { message: "banco de permissões indisponível" } });
    const resposta = await PATCH(requisicao());
    expect(resposta.status).toBe(ausente === "sessão" ? 401 : ausente === "organização" ? 403 : 500);
    expect(mock.createAdmin).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it.each([null, "https://outro.invalid"])("origem %s não chega ao guard nem ao banco", async (origin) => {
    expect((await PATCH(requisicao(undefined, origin))).status).toBe(403);
    expect(mock.loadAuthUser).not.toHaveBeenCalled();
    expect(mock.createAdmin).not.toHaveBeenCalled();
  });

  it("limite de abuso recusa antes de descriptografar", async () => {
    mock.limitar.mockResolvedValue(true);
    const resposta = await PATCH(requisicao());
    expect(resposta.status).toBe(429);
    expect(mock.limitar).toHaveBeenCalledExactlyOnceWith("account", USER);
    expect(mock.createAdmin).not.toHaveBeenCalled();
    expect(mock.decrypt).not.toHaveBeenCalled();
  });

  it.each([
    ["JSON inválido", "{"],
    ["id malformado", { default_account_id: "12345" }],
    ["tenant/ator injetados", { default_account_id: CONTA, organization_id: OUTRA_ORG, user_id: OUTRO_USER }],
    ["corpo acima de 1024 bytes", JSON.stringify({ default_account_id: "act_" + "1".repeat(1024) })],
  ])("%s é recusado antes de ler a conexão", async (_nome, body) => {
    expect((await PATCH(requisicao(body))).status).toBe(422);
    expect(mock.createAdmin).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["linha ausente", { data: null, error: null }],
    ["token cifrado ausente", { data: { access_token_encrypted: null }, error: null }],
    ["erro de leitura", { data: null, error: { message: TOKEN } }],
  ])("%s não consulta a plataforma nem reflete segredo", async (_nome, leitura) => {
    mock.maybeSingle.mockResolvedValue(leitura);
    const resposta = await PATCH(requisicao());
    const body = await resposta.json();
    expect(resposta.status).toBe(409);
    expect(body).toMatchObject({ error: { code: "not_connected" } });
    expect(mock.decrypt).not.toHaveBeenCalled();
    expect(mock.listarContas).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
    semSegredos(body);
  });

  it("falha de cifra não usa fallback plaintext nem lista contas", async () => {
    mock.decrypt.mockResolvedValue(null);
    const resposta = await PATCH(requisicao());
    const body = await resposta.json();
    expect(resposta.status).toBe(503);
    expect(mock.listarContas).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
    semSegredos(body);
  });

  it("Graph indisponível não salva conta recebida no body", async () => {
    mock.listarContas.mockResolvedValue({ ok: false, error: TOKEN });
    const resposta = await PATCH(requisicao());
    const body = await resposta.json();
    expect(resposta.status).toBe(503);
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.audit).not.toHaveBeenCalled();
    semSegredos(body);
  });

  it("id válido fora da lista realmente autorizada não chama a RPC", async () => {
    mock.listarContas.mockResolvedValue({ ok: true, dados: [{ id: "act_99999", nome: "Outra conta" }] });
    const resposta = await PATCH(requisicao());
    expect(resposta.status).toBe(403);
    expect(await resposta.json()).toMatchObject({ error: { code: "forbidden_account" } });
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.audit).not.toHaveBeenCalled();
  });

  it.each([
    ["token trocado durante a listagem", { data: { status: "connection_changed" }, error: null }],
    ["erro de banco", { data: null, error: { message: TOKEN } }],
    ["recibo ausente", { data: null, error: null }],
  ])("%s não confirma alteração nem expõe token", async (_nome, resultado) => {
    mock.rpc.mockResolvedValue(resultado);
    const resposta = await PATCH(requisicao());
    const body = await resposta.json();
    expect(resposta.status).toBe(409);
    expect(body).toMatchObject({ error: { code: "connection_changed" } });
    expect(mock.rpc).toHaveBeenCalledWith("fn_ad_insights_mutar_conexao", expect.objectContaining({ p_expected_token_encrypted: CIFRADO }));
    expect(mock.audit).not.toHaveBeenCalled();
    semSegredos(body);
  });
});
