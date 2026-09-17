/**
 * Configurações → consentimento → conta padrão, com Auth/DB/rotas/cifra reais.
 * Somente o consentimento externo e o transporte Graph são sintéticos: o
 * navegador sai para facebook.com (interceptado), volta com o state real e o
 * Next troca o código no receiver HTTP local por meio do preload do harness.
 * Não prova aprovação do aplicativo, permissões reais nem disponibilidade Meta.
 *
 * Duas invocações explícitas no CI, sem skip: a comum SEM as opções de OAuth;
 * a segunda com E2E_META_ADS_FIXTURE=1 e os três valores fictícios abaixo.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIResponse, type Page } from "@playwright/test";

import { assinarLink } from "@/lib/plataformas-de-anuncio/meta/oauth/estado";
import { LIMITES_OAUTH } from "@/lib/plataformas-de-anuncio/meta/oauth/limites";

const CONFIGURADO = process.env.E2E_META_ADS_FIXTURE === "1";
const CONFIG_FIXTURE = {
  META_APP_ID: "123456789012345",
  META_APP_SECRET: "meta-ads-oauth-local-fixture-only",
  META_LOGIN_CONFIG_ID: "987654321098765",
};
const SENHA = "Meta-OAuth-Local-Fixture-2026!";
const TOKEN_CURTO = "token-curto-sintetico-meta-ads-oauth-local";
const TOKEN_LONGO = "token-longo-sintetico-meta-ads-oauth-local";
const CONTA = "act_1234567890";
const CALLBACK = "/api/v1/ads/meta/oauth/callback";
const SETTINGS = "/app/settings/meta-ads";
const EVIDENCIAS = ".superpowers/evidence/meta-ads-oauth";
const AVISO_EXPIRACAO = "A autorização da conta de anúncios vence em até 7 dias. Conecte novamente para evitar uma interrupção.";
const LINK_INDISPONIVEL = "Este link de conexão está indisponível. Peça um novo link à pessoa responsável.";
const chamadas: Array<{ etapa: string; metodo: string }> = [];
let receiver: Server | undefined;

function localDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
    throw new Error("A prova OAuth exige Supabase local.");
  }
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function conferir(resultado: { error: unknown }) {
  if (resultado.error) throw resultado.error;
}

test.describe.configure({ timeout: 90_000 });
test.beforeAll(async () => {
  localDb();
  mkdirSync(EVIDENCIAS, { recursive: true });
  if (CONFIGURADO && process.env.E2E_LOCAL_HTTPS !== "1") {
    throw new Error("A prova OAuth exige HTTPS local e cookies reais; não afrouxe o guard do produto.");
  }
  for (const [nome, ficticio] of Object.entries(CONFIG_FIXTURE)) {
    if (CONFIGURADO ? process.env[nome] !== ficticio : Boolean(process.env[nome])) {
      throw new Error(`Pré-condição OAuth inválida: ${nome}; não executar com configuração real ou parcial.`);
    }
  }
  if (!CONFIGURADO) return;
  receiver = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1:54382");
    let bruto = "";
    for await (const chunk of req) bruto += chunk;
    const parametros = new URLSearchParams(url.search);
    for (const [chave, valor] of new URLSearchParams(bruto)) parametros.set(chave, valor);
    const caminho = url.pathname.replace(/^\/v\d+\.\d+\//, "/");
    res.setHeader("content-type", "application/json");
    const responder = (etapa: string, corpo: unknown) => {
      chamadas.push({ etapa, metodo: req.method ?? "" });
      res.end(JSON.stringify(corpo));
    };
    const appConfere = parametros.get("client_id") === CONFIG_FIXTURE.META_APP_ID
      && parametros.get("client_secret") === CONFIG_FIXTURE.META_APP_SECRET;
    const tokenInspecionado = parametros.get("input_token");
    if (req.method === "GET" && caminho === "/oauth/access_token" && appConfere
      && parametros.get("code") === "consentimento-sintetico"
      && parametros.get("redirect_uri") === `https://localhost:3443${CALLBACK}`) {
      responder("codigo", { access_token: TOKEN_CURTO, token_type: "bearer", expires_in: 3600 });
    } else if (req.method === "GET" && caminho === "/oauth/access_token" && appConfere
      && parametros.get("grant_type") === "fb_exchange_token" && parametros.get("fb_exchange_token") === TOKEN_CURTO) {
      responder("longa_duracao", { access_token: TOKEN_LONGO, token_type: "bearer", expires_in: 6 * 86400 });
    } else if (req.method === "GET" && caminho === "/debug_token"
      && req.headers.authorization === `Bearer ${CONFIG_FIXTURE.META_APP_ID}|${CONFIG_FIXTURE.META_APP_SECRET}`
      && (tokenInspecionado === TOKEN_CURTO || tokenInspecionado === TOKEN_LONGO)) {
      responder(tokenInspecionado === TOKEN_CURTO ? "validacao_inicial" : "validacao_final", { data: {
        app_id: CONFIG_FIXTURE.META_APP_ID, type: "USER", is_valid: true,
        user_id: "usuario-meta-sintetico", scopes: ["ads_read"],
        expires_at: Math.floor(Date.now() / 1000) + (tokenInspecionado === TOKEN_CURTO ? 3600 : 6 * 86400),
        data_access_expires_at: Math.floor(Date.now() / 1000) + 90 * 86400,
      } });
    } else if (req.method === "GET" && caminho === "/me/adaccounts" && req.headers.authorization === `Bearer ${TOKEN_LONGO}`) {
      responder("contas", { data: [{ id: CONTA, account_id: "1234567890", name: "Conta de anúncios fictícia", currency: "BRL", account_status: 1 }] });
    } else if (req.method === "GET" && [`/${CONTA}/campaigns`, `/${CONTA}/insights`].includes(caminho)
      && req.headers.authorization === `Bearer ${TOKEN_LONGO}`) {
      responder("desempenho_vazio", { data: [] });
    } else {
      chamadas.push({ etapa: "rota_nao_prevista", metodo: req.method ?? "" });
      res.writeHead(400);
      res.end(JSON.stringify({ error: { message: "A fixture não reconheceu esta chamada Graph." } }));
    }
  });
  await new Promise<void>((resolve, reject) => {
    receiver!.once("error", reject);
    receiver!.listen(54382, "127.0.0.1", resolve);
  });
});

test.beforeEach(() => { chamadas.length = 0; });
test.afterEach(async () => {
  await test.info().attach("graph-local-etapas-sem-segredos", {
    body: JSON.stringify(chamadas, null, 2), contentType: "application/json",
  });
});
test.afterAll(async () => {
  if (receiver) {
    receiver.closeAllConnections();
    await new Promise<void>(resolve => receiver!.close(() => resolve()));
  }
});

async function contaLocal(page: Page, papel: "admin" | "manager" | "agent" | "viewer") {
  const db = localDb();
  const org = randomUUID();
  const email = `meta-oauth-${randomUUID()}@example.test`;
  const criado = await db.auth.admin.createUser({ email, password: SENHA, email_confirm: true });
  conferir(criado);
  if (!criado.data.user) throw new Error("A fixture não criou o usuário local.");
  const user = criado.data.user.id;
  const nome = `Negócio OAuth de demonstração ${papel}`;
  conferir(await db.from("organizations").insert({
    id: org, slug: org, display_name: nome, legal_name: nome, created_by: user,
    locale: "pt-BR", onboarded_at: new Date().toISOString(),
  }));
  conferir(await db.from("user_organizations").insert({
    user_id: user, organization_id: org, role: papel, accepted_at: new Date().toISOString(),
  }));
  await page.goto("/login");
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.getByLabel(/senha/i).fill(SENHA);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/app(?:\/|$)/);
  return { db, org, user, nome, async limpar() {
    conferir(await db.from("organizations").delete().eq("id", org));
    conferir(await db.auth.admin.deleteUser(user));
  } };
}

async function medir(page: Page, nome: string) {
  for (const { width, height } of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize({ width, height });
    const medidas = await page.evaluate(() => ({
      viewport: { largura: innerWidth, altura: innerHeight }, documento: document.documentElement.scrollWidth,
      controles: [...(document.querySelector("main") ?? document.body).querySelectorAll<HTMLElement>("button,input:not([type=hidden]),select,summary")]
        .filter(el => el.getClientRects().length > 0).map(el => {
          const box = el.getBoundingClientRect();
          return { nome: el.getAttribute("aria-label") || el.id || el.textContent?.trim(),
            x: box.x, direita: box.right, largura: box.width, altura: box.height,
            fonte: getComputedStyle(el).fontSize };
        }),
    }));
    expect(medidas.documento, "a tela não transborda horizontalmente").toBeLessThanOrEqual(width);
    for (const controle of medidas.controles) {
      expect(controle.x, String(controle.nome)).toBeGreaterThanOrEqual(0);
      expect(controle.direita, String(controle.nome)).toBeLessThanOrEqual(width + 1);
      expect(controle.altura, String(controle.nome)).toBeGreaterThan(0);
    }
    writeFileSync(`${EVIDENCIAS}/e2e-${nome}-${width}.json`, JSON.stringify(medidas, null, 2));
    await test.info().attach(`${nome}-${width}-medidas`, { body: JSON.stringify(medidas), contentType: "application/json" });
    await page.screenshot({ path: `${EVIDENCIAS}/e2e-${nome}-${width}.png`, fullPage: true });
  }
}

async function vigiarRespostas(page: Page, origem: string, obrigatorias: string[]) {
  const prefetchesBloqueados: string[] = [];
  // O App Router pode abrir um prefetch RSC e abandoná-lo sem emitir término.
  // Bloqueamos somente a combinação inequívoca dos dois headers, antes de a
  // requisição sair. Toda resposta que realmente alcança a rede continua sob
  // a prova integral abaixo, sem timeout maior nem exceção de leitura.
  await page.route("**/*", async route => {
    const requisicao = route.request();
    const url = new URL(requisicao.url());
    const headers = requisicao.headers();
    if (url.origin === origem
      && headers["next-router-prefetch"] === "1"
      && headers.rsc === "1") {
      prefetchesBloqueados.push(url.pathname);
      await route.abort("blockedbyclient");
      return;
    }
    await route.fallback();
  });
  const cdp = await page.context().newCDPSession(page);
  // CDP conserva o corpo fora do renderer: OAuth troca de processo/origem e o
  // callback navega imediatamente. Ler no fim da jornada perdia corpos reais.
  // A API dedicada substitui enableDurableMessages (deprecated no Chromium).
  await cdp.send("Network.enable");
  await cdp.send("Network.configureDurableMessages", {
    maxTotalBufferSize: 32 * 1024 * 1024, maxResourceBufferSize: 4 * 1024 * 1024,
  });
  type Medida = {
    caminho: string; status: number; tipo: string;
    tokenExposto: boolean; erroLeitura: boolean; concluida: boolean; lida: boolean;
    falhaRede: string | null;
  };
  const respostas = new Map<string, Medida>();
  const tokens = [TOKEN_CURTO, TOKEN_LONGO];
  // Registra a ordem do protocolo, inclusive término anterior à resposta. Não
  // infere aborto da navegação nem inclui URL/query, headers ou corpo no recibo.
  const ciclos: Array<{ evento: string; requestId: string; loaderId?: string; caminho?: string; instante?: number }> = [];
  const requisicoesLocais = new Set<string>();
  cdp.on("Network.requestWillBeSent", ({ requestId, loaderId, request, timestamp }) => {
    const url = new URL(request.url);
    if (url.origin !== origem) return;
    requisicoesLocais.add(requestId);
    ciclos.push({ evento: "inicio", requestId, loaderId, instante: timestamp,
      caminho: url.pathname.replace(/\/ads\/connect\/(?!result(?:\/|$))[^/]+/, "/ads/connect/[capacidade]") });
  });
  let capturando = true;
  cdp.on("Network.responseReceived", ({ requestId, loaderId, response, timestamp }) => {
    if (!capturando) return;
    const url = new URL(response.url);
    if (url.origin === origem) ciclos.push({ evento: "resposta", requestId, loaderId, instante: timestamp });
    // A ponte QA substitui apenas o seguimento do 303. O corpo ORIGINAL dessas
    // duas respostas é lido por registrarInicioReal antes de route.fulfill;
    // Chromium não guarda corpo de rede para o documento sintético da ponte.
    if (/\/api\/v1\/ads\/meta\/oauth\/(?:connect|agency)$/.test(url.pathname)) return;
    if (url.origin !== origem || response.status < 200 || response.status >= 300
      || !/text\/html|application\/json|text\/x-component/.test(response.mimeType)) return;
    const medida: Medida = {
      caminho: url.pathname.replace(/\/ads\/connect\/(?!result(?:\/|$))[^/]+/, "/ads/connect/[capacidade]"),
      status: response.status, tipo: response.mimeType,
      tokenExposto: tokens.some(token => JSON.stringify(response.headers).includes(token)),
      erroLeitura: false, concluida: false, lida: false, falhaRede: null,
    };
    respostas.set(requestId, medida);
  });
  cdp.on("Network.loadingFinished", ({ requestId, timestamp }) => {
    if (requisicoesLocais.has(requestId)) ciclos.push({ evento: "concluida", requestId, instante: timestamp });
    const medida = respostas.get(requestId);
    if (!medida) return;
    medida.concluida = true;
    void cdp.send("Network.getResponseBody", { requestId }).then(({ body, base64Encoded }) => {
      const corpo = base64Encoded ? Buffer.from(body, "base64").toString("utf8") : body;
      medida.tokenExposto ||= tokens.some(token => corpo.includes(token));
      medida.lida = true;
    }).catch(() => { medida.erroLeitura = true; });
  });
  cdp.on("Network.loadingFailed", ({ requestId, errorText, timestamp }) => {
    if (requisicoesLocais.has(requestId)) ciclos.push({ evento: "falhou", requestId, instante: timestamp });
    const medida = respostas.get(requestId);
    if (medida) medida.falhaRede = errorText;
  });
  return { async registrarInicioReal(resposta: APIResponse) {
    const medida: Medida = {
      caminho: new URL(resposta.url()).pathname, status: resposta.status(),
      tipo: resposta.headers()["content-type"] ?? "text/html",
      tokenExposto: tokens.some(token => JSON.stringify(resposta.headers()).includes(token)),
      erroLeitura: false, concluida: true, lida: false, falhaRede: null,
    };
    respostas.set(`inicio-real-${respostas.size}`, medida);
    try {
      const corpo = await resposta.text();
      medida.tokenExposto ||= tokens.some(token => corpo.includes(token));
      medida.lida = true;
    } catch { medida.erroLeitura = true; }
  }, async provar() {
    // Congela o conjunto observado, NÃO uma lista de promises que ainda pode
    // crescer. loadingFinished significa transferência concluída, não corpo já
    // lido: só getResponseBody resolvido autoriza lida=true.
    capturando = false;
    const medidas = [...respostas.values()];
    const semDesfecho = () => medidas.filter(medida => !medida.lida && !medida.erroLeitura && !medida.falhaRede);
    try {
      await expect.poll(() => semDesfecho().map(medida => medida.caminho), {
        timeout: 10_000, intervals: [100, 250, 500],
        message: "toda resposta real termina com corpo lido ou falha/aborto explícito" }).toEqual([]);
    } finally {
      await test.info().attach("respostas-sem-token", { body: JSON.stringify(medidas), contentType: "application/json" });
      await test.info().attach("ciclo-requisicoes-sem-segredos", { body: JSON.stringify(ciclos), contentType: "application/json" });
      await test.info().attach("prefetches-rsc-bloqueados", {
        body: JSON.stringify(prefetchesBloqueados), contentType: "application/json",
      });
    }
    const concluidas = medidas.filter(medida => medida.concluida);
    expect(concluidas.length, "controle positivo: respostas reais do app foram lidas").toBeGreaterThan(0);
    expect(concluidas.some(medida => medida.erroLeitura), "a prova não ignora corpo concluído que não conseguiu ler").toBe(false);
    expect(concluidas.every(medida => medida.lida), "transferência concluída não substitui leitura do corpo").toBe(true);
    for (const caminho of obrigatorias) {
      expect(concluidas.some(medida => medida.caminho === caminho && medida.lida && !medida.erroLeitura), `corpo real obrigatório: ${caminho}`).toBe(true);
    }
    expect(medidas.some(medida => medida.tokenExposto), "token Graph não alcança HTML, JSON ou headers do navegador").toBe(false);
    await cdp.detach();
  } };
}

async function consentimentoSintetico(page: Page, registrarInicioReal: (resposta: APIResponse) => Promise<void>) {
  let callback = "";
  // O Playwright só intercepta o PRIMEIRO URL de uma cadeia HTTP de redirects
  // (types.d.ts da versão instalada, page.route). Deixar o 303 seguir faria
  // Facebook real responder antes da fixture. O POST continua REAL; somente o
  // seguimento é convertido em um link de QA, com Location/Set-Cookie provados.
  // A nova navegação tem origem Facebook e o callback/cookies continuam reais.
  // Isto não prova o consentimento/aplicativo externo nem seu HTTP de produção.
  await page.route(/^https?:\/\//, async route => {
    const host = new URL(route.request().url()).hostname;
    if (["localhost", "127.0.0.1", "[::1]"].includes(host)) await route.fallback();
    else await route.abort("blockedbyclient");
  });
  await page.route(/\/api\/v1\/ads\/meta\/oauth\/(?:connect|agency)$/, async route => {
    expect(route.request().method()).toBe("POST");
    const resposta = await route.fetch({ maxRedirects: 0 });
    await registrarInicioReal(resposta);
    await test.info().attach("post-oauth-origem-e-status", {
      body: JSON.stringify({ caminho: new URL(route.request().url()).pathname,
        origem: route.request().headers().origin, status: resposta.status(),
        origemDocumento: new URL(page.url()).origin,
        refererContemCapacidade: (route.request().headers().referer ?? "").includes("/ads/connect/"),
      }),
      contentType: "application/json",
    });
    expect(route.request().headers().origin).toBe("https://localhost:3443");
    if (new URL(route.request().url()).pathname.endsWith("/agency")) {
      expect(route.request().headers().referer, "form público envia só a origem, nunca a capacidade").toBe("https://localhost:3443/");
    }
    expect(resposta.status()).toBe(303);
    const headers = resposta.headers();
    expect(headers["referrer-policy"], "header real do 303 prevalece sobre a política global").toBe("no-referrer");
    const destino = new URL(headers.location!);
    expect(destino.origin).toBe("https://www.facebook.com");
    expect(destino.pathname).toMatch(/^\/v\d+\.\d+\/dialog\/oauth$/);
    expect(destino.searchParams.get("client_id")).toBe(CONFIG_FIXTURE.META_APP_ID);
    expect(destino.searchParams.get("config_id")).toBe(CONFIG_FIXTURE.META_LOGIN_CONFIG_ID);
    expect(Boolean(destino.searchParams.get("state"))).toBe(true);
    expect(destino.searchParams.get("redirect_uri")).toBe(`https://localhost:3443${CALLBACK}`);
    const cookie = headers["set-cookie"] ?? "";
    const atributos = {
      binding: /__Host-ads_oauth_bind_/.test(cookie), httpOnly: /httponly/i.test(cookie),
      secure: /;\s*secure/i.test(cookie), sameSiteLax: /samesite=lax/i.test(cookie),
      pathRaiz: /path=\/(?:;|$)/i.test(cookie),
    };
    expect(atributos).toEqual({ binding: true, httpOnly: true, secure: true, sameSiteLax: true, pathRaiz: true });
    await test.info().attach("inicio-oauth-real-sem-segredos", {
      body: JSON.stringify({ metodo: "POST", status: resposta.status(), destino: destino.origin + destino.pathname,
        referrerPolicy: headers["referrer-policy"], atributos }),
      contentType: "application/json",
    });
    delete headers.location;
    delete headers["content-length"];
    await route.fulfill({ response: resposta, status: 200, headers, contentType: "text/html; charset=utf-8",
      body: `<html lang="pt-BR"><body><a href="${destino.href.replaceAll("&", "&amp;")}">Seguir redirecionamento da prova local</a></body></html>` });
  });
  await page.route(/^https:\/\/(?:www\.)?facebook\.com\//, async route => {
    const url = new URL(route.request().url());
    expect(route.request().isNavigationRequest()).toBe(true);
    expect(route.request().method()).toBe("GET");
    expect(route.request().headers().referer, "o redirecionamento externo não revela URL de capacidade").toBeUndefined();
    expect(url.pathname).toMatch(/^\/v\d+\.\d+\/dialog\/oauth$/);
    expect(url.searchParams.get("client_id")).toBe(CONFIG_FIXTURE.META_APP_ID);
    expect(url.searchParams.get("config_id")).toBe(CONFIG_FIXTURE.META_LOGIN_CONFIG_ID);
    const state = url.searchParams.get("state");
    expect(state).toBeTruthy();
    const destino = new URL(url.searchParams.get("redirect_uri")!);
    expect(["localhost", "127.0.0.1"]).toContain(destino.hostname);
    expect(destino.pathname).toBe(CALLBACK);
    destino.searchParams.set("state", state!);
    destino.searchParams.set("code", "consentimento-sintetico");
    callback = destino.href;
    // Navegação cross-site verdadeira, mas sem rede externa nem login Meta.
    // O link devolve ao callback como o provedor faria, incluindo SameSite.
    await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body:
      `<html lang="pt-BR"><body><h1>Consentimento fictício da prova local</h1><a href="${callback.replaceAll("&", "&amp;")}">Autorizar conexão fictícia</a></body></html>` });
  });
  return { callback: () => callback };
}

async function autorizar(page: Page) {
  await test.info().attach("pagina-antes-do-post", {
    body: JSON.stringify({ origem: new URL(page.url()).origin,
      referrerPolicy: await page.locator('meta[name="referrer"]').evaluateAll(els => els.map(el => el.getAttribute("content"))) }),
    contentType: "application/json",
  });
  await page.getByRole("button", { name: "Conectar com Facebook", exact: true }).click();
  await page.getByRole("link", { name: "Seguir redirecionamento da prova local", exact: true }).click();
  const cookies = (await page.context().cookies("https://localhost:3443"))
    .filter(cookie => cookie.name.startsWith("__Host-ads_oauth_bind_"))
    .map(cookie => ({ secure: cookie.secure, httpOnly: cookie.httpOnly, sameSite: cookie.sameSite }));
  expect(cookies).toContainEqual({ secure: true, httpOnly: true, sameSite: "Lax" });
  await expect(page.getByRole("heading", { name: "Consentimento fictício da prova local" })).toBeVisible();
  await page.getByRole("link", { name: "Autorizar conexão fictícia" }).click();
}

async function gerarLink(page: Page) {
  const resposta = page.waitForResponse(r => r.url().endsWith("/api/v1/ads/meta/oauth/links") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Gerar link de conexão", exact: true }).click();
  const retorno = await resposta;
  expect(retorno.status()).toBe(201);
  const json = await retorno.json() as { data: { url: string; expires_at: string } };
  for (const token of [TOKEN_CURTO, TOKEN_LONGO]) {
    expect(JSON.stringify(json)).not.toContain(token);
    expect(JSON.stringify(retorno.headers())).not.toContain(token);
  }
  const campo = page.getByLabel("Link para quem cuida dos anúncios", { exact: true });
  await expect(campo).toHaveValue(json.data.url);
  const ttl = Date.parse(json.data.expires_at) - Date.now();
  expect(ttl).toBeGreaterThan(29 * 60_000);
  expect(ttl).toBeLessThanOrEqual(30 * 60_000 + 1000);
  return json.data.url;
}

if (!CONFIGURADO) {
  test.describe("sem OAuth opcional — instalação continua utilizável", () => {
    for (const papel of ["admin", "manager"] as const) {
      test(`${papel}: botão ausente e fallback respeita o papel sem autofill`, async ({ page }) => {
        const fixture = await contaLocal(page, papel);
        try {
          await page.goto(SETTINGS);
          await expect(page.getByRole("heading", { name: "Meta Ads", exact: true })).toBeVisible();
          await expect(page.getByRole("button", { name: "Conectar com Facebook", exact: true })).toHaveCount(0);
          await expect(page.getByRole("button", { name: "Gerar link de conexão", exact: true })).toHaveCount(0);
          const token = page.locator("#access_token");
          if (papel === "admin") {
            await expect(token).toBeVisible();
            await expect(token).toHaveValue("");
            await expect(token).toHaveAttribute("autocomplete", "new-password");
            await expect(page.locator("#default_account_id")).toHaveValue("");
            await expect(page.locator("#default_account_id")).toHaveAttribute("autocomplete", "off");
          } else {
            await expect(token).toHaveCount(0);
            await expect(page.locator("#default_account_id")).toHaveCount(0);
            await expect(page.getByText("A conexão automática não está disponível nesta instalação. Peça a quem administra a organização para configurar a conexão manual.", { exact: true })).toBeVisible();
          }
          await medir(page, `sem-oauth-${papel}`);
        } finally { await fixture.limpar(); }
      });
    }
  });
} else {
  test.describe("com OAuth sintético — Graph local, acesso real", () => {
    for (const papel of ["admin", "manager"] as const) {
      test(`${papel}: conecta pela tela, escolhe conta e mostra validade sem expor token`, async ({ page }) => {
        const respostas = await vigiarRespostas(page, "https://localhost:3443",
          [SETTINGS, "/api/v1/ads/meta/oauth/connect", CALLBACK, "/api/v1/ads/meta/accounts", "/api/v1/ads/meta/account", "/app/ads/meta"]);
        // Instalar o transporte antes da primeira navegação, como na agência:
        // não habilitar interceptação com os prefetches do login já em voo.
        await consentimentoSintetico(page, respostas.registrarInicioReal);
        const fixture = await contaLocal(page, papel);
        try {
          await page.goto(SETTINGS);
          await expect(page.locator("#access_token")).not.toBeVisible();
          await medir(page, `conectar-${papel}`);
          await autorizar(page);
          await expect(page).toHaveURL(/\/app\/settings\/meta-ads\?oauth=conectado/);
          await expect(page.getByRole("status").filter({ hasText: "Conexão autorizada." })).toBeVisible();
          await page.getByLabel("Conta de anúncios padrão", { exact: true }).selectOption(CONTA);
          await page.getByRole("button", { name: "Salvar conta padrão", exact: true }).click();
          await expect(page.getByRole("status").filter({ hasText: "Conta padrão salva." })).toBeVisible();
          const conexao = await fixture.db.from("ad_insights_connections")
            .select("default_account_id,access_token_encrypted,token_expires_at")
            .eq("organization_id", fixture.org).eq("platform", "meta_ads").single();
          conferir(conexao);
          expect(conexao.data?.default_account_id).toBe(CONTA);
          expect(Boolean(conexao.data?.access_token_encrypted)).toBe(true);
          expect(conexao.data?.access_token_encrypted === TOKEN_LONGO).toBe(false);
          expect(Date.parse(conexao.data!.token_expires_at) - Date.now()).toBeLessThan(7 * 86400_000);
          await test.info().attach("persistencia-sem-segredos", {
            body: JSON.stringify({ papel, contaPadraoConfere: conexao.data?.default_account_id === CONTA,
              cifraExiste: Boolean(conexao.data?.access_token_encrypted),
              cifraDiferenteDoToken: conexao.data?.access_token_encrypted !== TOKEN_LONGO,
              prazoMenorQueSeteDias: Date.parse(conexao.data!.token_expires_at) - Date.now() < 7 * 86400_000,
            }), contentType: "application/json",
          });
          expect(chamadas.filter(c => c.etapa !== "contas").map(c => c.etapa)).toEqual(["codigo", "validacao_inicial", "longa_duracao", "validacao_final"]);
          expect(await page.content()).not.toContain(TOKEN_LONGO);
          if (papel === "admin") {
            await page.locator("summary").filter({ hasText: "Avançado" }).click();
            await expect(page.locator("#access_token")).toHaveValue("");
            await expect(page.locator("#access_token")).toHaveAttribute("autocomplete", "new-password");
          } else {
            await expect(page.locator("#access_token")).toHaveCount(0);
            await expect(page.locator("summary").filter({ hasText: "Avançado" })).toHaveCount(0);
          }
          await medir(page, `conectado-${papel}`);
          // A validade é apresentada na tela que consome os anúncios, não no
          // formulário de configuração. Verifica o aviso onde o usuário o vê.
          await page.goto("/app/ads/meta");
          await expect(page.getByText(AVISO_EXPIRACAO, { exact: true })).toBeVisible();
          await medir(page, `validade-${papel}`);
          await respostas.provar();
        } finally { await fixture.limpar(); }
      });
    }

    test("agência: link de 30 minutos funciona sem login e só pode ser usado uma vez", async ({ page, browser }) => {
      const fixture = await contaLocal(page, "admin");
      const publico = await browser.newContext({ ignoreHTTPSErrors: true });
      try {
        await page.goto(SETTINGS);
        const link = await gerarLink(page);
        const cliente = await publico.newPage();
        const respostas = await vigiarRespostas(cliente, new URL(link).origin,
          ["/ads/connect/[capacidade]", "/api/v1/ads/meta/oauth/agency", CALLBACK, "/ads/connect/result"]);
        await consentimentoSintetico(cliente, respostas.registrarInicioReal);
        const entradaPublica = await cliente.goto(link);
        expect(entradaPublica?.headers()["referrer-policy"], "política protege a capacidade desde o header, antes de metadata/JS").toBe("strict-origin");
        await test.info().attach("header-publico-sem-segredos", {
          body: JSON.stringify({ status: entradaPublica?.status(), referrerPolicy: entradaPublica?.headers()["referrer-policy"] }),
          contentType: "application/json",
        });
        await expect(cliente.getByRole("heading", { name: fixture.nome, exact: true })).toBeVisible();
        await expect(cliente.getByRole("button", { name: "Conectar com Facebook", exact: true })).toBeVisible();
        await expect(cliente.locator("aside,nav,input[type=email],input[type=password],#default_account_id")).toHaveCount(0);
        await expect(cliente.getByRole("button")).toHaveCount(1);
        await medir(cliente, "agencia-publica");
        await cliente.reload(); // GET/prefetch não pode consumir a autorização.
        const antes = await fixture.db.from("ad_insights_oauth_requests")
          .select("consumed_at").eq("organization_id", fixture.org).eq("kind", "link").single();
        conferir(antes);
        expect(antes.data?.consumed_at).toBeNull();
        await autorizar(cliente);
        await expect(cliente).toHaveURL(/\/ads\/connect\/result\?status=conectado$/);
        await expect(cliente.locator("aside,nav,input[type=password],#meta_ads_selected_account")).toHaveCount(0);
        await medir(cliente, "agencia-conectada");
        const depois = await fixture.db.from("ad_insights_oauth_requests")
          .select("consumed_at").eq("organization_id", fixture.org).eq("kind", "link").single();
        conferir(depois);
        expect(depois.data?.consumed_at).toBeTruthy();
        const chamadasAntes = chamadas.length;
        await cliente.goto(link);
        await expect(cliente.getByRole("button", { name: "Conectar com Facebook", exact: true })).toHaveCount(0);
        await expect(cliente.getByRole("status")).toHaveText(LINK_INDISPONIVEL);
        expect(chamadas.length).toBe(chamadasAntes);
        expect(chamadas.map(c => c.etapa)).toEqual(["codigo", "validacao_inicial", "longa_duracao", "validacao_final"]);
        expect(await cliente.content()).not.toContain(TOKEN_LONGO);
        await respostas.provar();
      } finally { await publico.close(); await fixture.limpar(); }
    });

    test("agência: link expirado recusa antes de abrir o consentimento", async ({ page, browser }) => {
      const fixture = await contaLocal(page, "manager");
      const publico = await browser.newContext({ ignoreHTTPSErrors: true });
      try {
        await page.goto(SETTINGS);
        const link = await gerarLink(page);
        const agora = Date.now();
        const registro = await fixture.db.from("ad_insights_oauth_requests").select("id")
          .eq("organization_id", fixture.org).eq("kind", "link").single();
        conferir(registro);
        // Só a fixture local; mantém a duração máxima e expires_at > created_at.
        conferir(await fixture.db.from("ad_insights_oauth_requests").update({
          created_at: new Date(agora - 31 * 60_000).toISOString(),
          expires_at: new Date(agora - 60_000).toISOString(),
        }).eq("organization_id", fixture.org).eq("kind", "link"));
        // A assinatura e o DB concordam no prazo já passado. Apenas mudar o
        // banco daria vermelho por divergência mesmo com o gate de prazo removido.
        const tokenExpirado = assinarLink({ requestId: registro.data!.id, expiresAt: agora - 60_000 }, new Date(agora - 31 * 60_000));
        expect(tokenExpirado).toBeTruthy();
        const linkExpirado = new URL(`/ads/connect/${tokenExpirado}`, link).href;
        const cliente = await publico.newPage();
        await cliente.goto(linkExpirado);
        await expect(cliente.getByRole("button", { name: "Conectar com Facebook", exact: true })).toHaveCount(0);
        await expect(cliente.getByRole("status")).toHaveText(LINK_INDISPONIVEL);
        await medir(cliente, "agencia-expirada");
        expect(chamadas).toEqual([]);
      } finally { await publico.close(); await fixture.limpar(); }
    });

    for (const papel of ["viewer", "agent"] as const) {
      test(`${papel}: URL direta e início OAuth não concedem acesso`, async ({ page }) => {
        const fixture = await contaLocal(page, papel);
        try {
          await page.goto(SETTINGS);
          await expect(page).toHaveURL(/\/403(?:\?|$)/);
          await expect(page.getByRole("button", { name: "Conectar com Facebook", exact: true })).toHaveCount(0);
          const origem = new URL(page.url()).origin;
          for (const caminho of ["/api/v1/ads/meta/oauth/connect", "/api/v1/ads/meta/oauth/links"]) {
            const resposta = await page.request.post(caminho, { headers: { Origin: origem }, data: {}, maxRedirects: 0 });
            expect(resposta.status()).toBe(403);
          }
          expect(chamadas).toEqual([]);
        } finally { await fixture.limpar(); }
      });
    }

    for (const superficie of ["pagina", "agency", "callback"] as const) {
      test(`abuso público: ${superficie} responde HTTP429 real antes do Graph`, async ({ request, baseURL }) => {
        expect(LIMITES_OAUTH).toEqual({ ip: 60, id: 20, windowSec: 60 });
        const janelaMs = LIMITES_OAUTH.windowSec * 1000;
        // O contador é por janela fixa. Começar na primeira metade evita
        // atravessar sua virada durante a rajada, sem alterar relógio/contador.
        await expect.poll(() => Date.now() % janelaMs, {
          timeout: janelaMs, intervals: [100, 250, 500],
          message: "a rajada começa com pelo menos meia janela real disponível",
        }).toBeLessThan(janelaMs / 2);
        const inicio = Date.now();
        const identificador = `capacidade-sintetica-invalida-${randomUUID()}`;
        const origem = new URL(baseURL!).origin;
        const ip = { pagina: "203.0.113.201", agency: "203.0.113.202", callback: "203.0.113.203" }[superficie];
        const medidas: Array<{ tentativa: number; metodo: string; status: number; retryAfter?: string; bytes: number }> = [];
        try {
          // Na página GET e HEAD compartilham a capacidade, mesmo com query
          // diferente. A última HEAD prova que o bloqueio não entrega corpo.
          const tentativas = LIMITES_OAUTH.id + (superficie === "pagina" ? 2 : 1);
          for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
            const metodo = superficie === "agency" ? "POST"
              : superficie === "pagina" && tentativa % 2 === 0 ? "HEAD" : "GET";
            const caminho = superficie === "pagina" ? `/ads/connect/${identificador}?tentativa=${tentativa}`
              : superficie === "agency" ? "/api/v1/ads/meta/oauth/agency"
              : `${CALLBACK}?state=${identificador}&code=codigo-invalido-local`;
            const resposta = await request.fetch(caminho, {
              method: metodo, maxRedirects: 0,
              headers: { "x-forwarded-for": ip, Origin: origem },
              ...(superficie === "agency" ? { form: { link: identificador } } : {}),
            });
            const corpo = await resposta.text();
            const headers = resposta.headers();
            medidas.push({ tentativa, metodo, status: resposta.status(), retryAfter: headers["retry-after"], bytes: Buffer.byteLength(corpo) });
            if (tentativa <= LIMITES_OAUTH.id) {
              expect(resposta.status(), `tentativa ${tentativa} ainda está dentro do teto`).toBe(superficie === "agency" ? 303 : 200);
              expect(headers["retry-after"]).toBeUndefined();
            } else {
              expect(resposta.status(), `tentativa ${tentativa} é recusada pelo servidor`).toBe(429);
              expect(headers["retry-after"]).toBe(String(LIMITES_OAUTH.windowSec));
              expect(headers["cache-control"]).toContain("no-store");
              expect(headers["x-request-id"]).toBeTruthy();
              expect(headers.location).toBeUndefined();
              expect(corpo).not.toContain(identificador);
              if (metodo === "HEAD") expect(corpo).toBe("");
              else expect(corpo).toContain("Muitas tentativas");
            }
            expect(chamadas, "abuso inválido não chega ao transporte Graph").toEqual([]);
            await resposta.dispose();
          }
          expect(Math.floor(Date.now() / janelaMs), "a prova não atravessou uma virada de janela").toBe(Math.floor(inicio / janelaMs));
        } finally {
          await test.info().attach(`http429-${superficie}-sem-segredos`, {
            body: JSON.stringify({ superficie, limites: LIMITES_OAUTH, ipReservado: ip,
              duracaoMs: Date.now() - inicio, medidas, chamadasGraph: chamadas.length }),
            contentType: "application/json",
          });
        }
      });
    }
  });
}
