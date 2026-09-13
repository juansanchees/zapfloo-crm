/**
 * P0: welcome → ensaio → autorização restrita → funil → conclusão, pela tela.
 *
 * Banco/Auth/actions/leitor reais, com receivers HTTP locais para o site e a IA.
 * O preload troca SOMENTE o transporte externo de hosts reservados da fixture;
 * não há interceptação das rotas do produto nem preenchimento de progresso no DB.
 * Canal WORKING é precondição sintética: não prova pareamento/envio WhatsApp.
 * Não prova DNS/TLS públicos nem qualidade de uma resposta de IA comercial.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createServer, type Server } from "node:http";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

const SENHA = "Fixture-Site-Onboarding-2026!";
const MODELO = "qa-site-http";
const RESPOSTA_ENSAIO = "Resposta local de demonstração: posso ajudar com o atendimento.";
const EVIDENCIAS = ".superpowers/evidence/onboarding-site";
const hits: string[] = [];
const chamadasIa: Record<string, unknown>[] = [];
let siteReceiver: Server;
let iaReceiver: Server;

function localDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("A prova exige banco local.");
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}

function conferir(resultado: { error: unknown }) {
  if (resultado.error) throw resultado.error;
}

async function escutar(server: Server, port: number) {
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
}

const SITE = `<!doctype html><html lang="pt-BR"><head><title>Clínica de demonstração</title></head><body>
<h1>Clínica de demonstração: consultas e acompanhamento</h1>
<p>Atendemos consultas iniciais e acompanhamos cada agendamento com confirmação.</p>
<a href="/duvidas">Perguntas frequentes</a>
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org", "@type": "Product", name: "Consulta inicial de demonstração",
  description: "Serviço fictício utilizado apenas no teste local.",
  offers: { "@type": "Offer", price: "129.90", priceCurrency: "BRL" },
})}</script></body></html>`;
const FAQ = `<!doctype html><html lang="pt-BR"><body><h1>Perguntas frequentes</h1>
<p>Como marcar uma consulta? Pelo atendimento da clínica.</p>
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [{
    "@type": "Question", name: "Como marcar uma consulta?",
    acceptedAnswer: { "@type": "Answer", text: "Pelo atendimento da clínica." },
  }],
})}</script></body></html>`;

test.describe.configure({ timeout: 150_000 });
test.beforeAll(async () => {
  // Falhar, nunca pular: sem este opt-in estaríamos medindo rede/provedor real.
  if (process.env.E2E_ONBOARDING_SITE_FIXTURE !== "1" || process.env.E2E_ONBOARDING_SYNTHETIC_PROVIDER !== "1"
    || process.env.OPENAI_API_KEY !== "onboarding-local-provider-only") throw new Error("Rode com os dois preloads locais e a chave sintética do harness.");
  const svc = localDb();
  conferir(await svc.from("ai_models").upsert({ provider: "openai", model_id: MODELO, display_name: "Modelo do receiver local", supports_tools: true }, { onConflict: "provider,model_id" }));
  mkdirSync(EVIDENCIAS, { recursive: true });
  siteReceiver = createServer((req, res) => {
    hits.push(req.url ?? "");
    if (req.url?.startsWith("/fora.onboarding-site.test/")) { req.socket.destroy(); return; }
    // Nunca responde: o timeout do LEITOR é quem precisa encerrar a leitura,
    // enquanto o POST de boas-vindas e a navegação seguem independentes.
    if (req.url?.startsWith("/lento.onboarding-site.test/")) return;
    if (!req.url?.startsWith("/valido.onboarding-site.test/")) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(req.url.includes("/duvidas") ? FAQ : SITE);
  });
  iaReceiver = createServer(async (req, res) => {
    let raw = ""; for await (const chunk of req) raw += chunk;
    const input = JSON.parse(raw) as Record<string, unknown>;
    chamadasIa.push(input);
    const texto = JSON.stringify(input).includes("Você monta o quadro") ? JSON.stringify({ nome: "Atendimento da clínica", etapas: [
      { nome: "Acabou de chamar", passo: "new" }, { nome: "Entendendo a consulta", passo: "qualifying" },
      { nome: "Combinando o horário", passo: "negotiating" }, { nome: "Consulta marcada", passo: "won" }, { nome: "Não marcou agora", passo: "lost" },
    ] }) : RESPOSTA_ENSAIO;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: "resp_site_qa", object: "response", created_at: 1788894000, status: "completed", model: MODELO,
      output: [{ id: "msg_site_qa", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: texto, annotations: [] }] }],
      usage: { input_tokens: 20, output_tokens: 15, total_tokens: 35, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } }, error: null, incomplete_details: null }));
  });
  await escutar(siteReceiver, 54381);
  await escutar(iaReceiver, 54380);
});

test.afterAll(async () => {
  for (const server of [siteReceiver, iaReceiver]) if (server) {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
  conferir(await localDb().from("ai_models").delete().eq("provider", "openai").eq("model_id", MODELO));
});

async function novaOrganizacao(page: Page) {
  const svc = localDb();
  const org = randomUUID(); const canal = randomUUID();
  const email = `site-${randomUUID()}@example.test`;
  const created = await svc.auth.admin.createUser({ email, password: SENHA, email_confirm: true });
  conferir(created);
  if (!created.data.user) throw new Error("A fixture não criou o usuário.");
  const user = created.data.user.id;
  conferir(await svc.from("organizations").insert({ id: org, slug: org, legal_name: "Negócio local de teste", display_name: "Minha Empresa", created_by: user }));
  conferir(await svc.from("user_organizations").insert({ user_id: user, organization_id: org, role: "admin", accepted_at: new Date().toISOString() }));
  // Pré-condição de transporte apenas: nenhum marcador do wizard é semeado.
  conferir(await svc.from("channel_sessions").insert({ id: canal, organization_id: org, display_name: "Canal fictício local", waha_session_name: `site_fixture_${canal}`, status: "WORKING",
    webhook_secret_encrypted: "\\x00", metadata: { ai_gate: "allowlist", ai_gate_mode: "pre_go_live", ai_test_phone_numbers: ["+5511999998888"] } }));
  await page.goto("/login");
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.getByLabel(/Senha/, { exact: true }).fill(SENHA);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding\/welcome/);
  return { svc, org, canal, user, async limpar() {
    conferir(await svc.from("organizations").delete().eq("id", org));
    conferir(await svc.auth.admin.deleteUser(user));
  } };
}

async function medir(page: Page, nome: string) {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const medidas = await page.evaluate(() => ({ largura: innerWidth, documento: document.documentElement.scrollWidth,
      controles: [...document.querySelectorAll<HTMLInputElement | HTMLButtonElement>("main input:not([type=hidden]), main button")]
        .filter(el => el.getClientRects().length > 0).map(el => { const b = el.getBoundingClientRect(); return { nome: el.getAttribute("aria-label") || el.id || el.textContent, x: b.x, direita: b.right, largura: b.width, altura: b.height, fonte: getComputedStyle(el).fontSize }; }) }));
    expect(medidas.documento).toBeLessThanOrEqual(medidas.largura);
    for (const controle of medidas.controles) {
      expect(controle.x, String(controle.nome)).toBeGreaterThanOrEqual(0);
      expect(controle.direita, String(controle.nome)).toBeLessThanOrEqual(width + 1);
    }
    await test.info().attach(`${nome}-${width}-medidas`, { body: JSON.stringify(medidas, null, 2), contentType: "application/json" });
    await page.screenshot({ path: `${EVIDENCIAS}/${nome}-${width}.png`, fullPage: true });
  }
}

async function boasVindas(page: Page, site = "") {
  await page.locator("#display_name").fill("Clínica local de demonstração");
  await page.locator("#segmento").selectOption("clinica");
  await page.locator("#o_que_faz").fill("Consultas e agendamentos de demonstração");
  await page.getByLabel("Site do seu negócio (opcional)", { exact: true }).fill(site);
  await page.getByRole("checkbox").check();
}

async function irAteFunil(page: Page, canal: string) {
  await expect(page).toHaveURL(/\/onboarding\/setup-ai/);
  await page.locator("#name").fill("Atendente de demonstração");
  await page.locator("#objetivo").fill("Ajudar com o agendamento de consultas");
  await page.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Rascunho salvo" })).toBeVisible();
  // A main escolhe o modelo e a chave automaticamente no onboarding. Continuar
  // exigindo o seletor antigo testaria uma tela que o assinante não vê mais.
  await expect(page.locator("#ensaio-model, #ensaio-credential")).toHaveCount(0);
  await page.getByRole("button", { name: "Preparar ensaio", exact: true }).click();
  await expect(page.getByRole("button", { name: "Preparar ensaio", exact: true })).toBeEnabled();
  await page.locator("#ensaio-message").fill("Olá, preciso agendar uma consulta fictícia.");
  await page.getByRole("button", { name: "Testar mensagem", exact: true }).click();
  await expect(page.getByText(RESPOSTA_ENSAIO, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Revisar resposta", exact: true }).click();
  await page.getByRole("button", { name: "Continuar para conexão", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding\/connect-whatsapp/);
  await page.locator("#canal-teste").selectOption(canal);
  await page.getByRole("button", { name: "Ativar para estes números de teste", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ativação restrita confirmada", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Continuar", exact: true }).click();
  if (process.env.NUVEMSHOP_ENABLED === "true") {
    await expect(page).toHaveURL(/\/onboarding\/connect-nuvemshop/);
    await page.getByRole("button", { name: "Pular por enquanto", exact: true }).click();
  }
  await expect(page).toHaveURL(/\/onboarding\/funil/);
  await expect(page.getByRole("heading", { name: "Onde ele organiza seus clientes", exact: true })).toBeVisible();
  expect(await page.getByLabel(/^Nome da coluna \d+$/).count()).toBeGreaterThanOrEqual(4);
  expect(await page.getByLabel(/^Nome da coluna \d+$/).count()).toBeLessThanOrEqual(8);
}

async function finalizarQuadro(page: Page) {
  await page.getByRole("button", { name: "Usar este quadro", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding\/invite-team/);
  await page.getByRole("button", { name: "Pular por enquanto", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding\/done/);
}

test("site opcional: vazio avança; rede social recebe recusa inline sem disparar leitura", async ({ page }) => {
  const fixture = await novaOrganizacao(page);
  try {
    await boasVindas(page, "instagram.com/negocio-ficticio");
    const campo = page.getByLabel("Site do seu negócio (opcional)", { exact: true });
    await expect(page.getByRole("alert").filter({ hasText: /Não consigo ler o Instagram/ })).toBeVisible();
    await campo.fill("facebook.com/negocio-ficticio");
    await expect(page.getByRole("alert").filter({ hasText: /Não consigo ler o Instagram/ })).toBeVisible();
    await campo.fill("");
    await expect(page.getByRole("alert").filter({ hasText: /Não consigo ler o Instagram/ })).toHaveCount(0);
    await medir(page, "welcome-opcional");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(page).toHaveURL(/\/onboarding\/setup-ai/);
    const fontes = await fixture.svc.from("ai_knowledge_sources").select("id").eq("organization_id", fixture.org).eq("source_type", "site");
    conferir(fontes); expect(fontes.data).toHaveLength(0);
  } finally { await fixture.limpar(); }
});

for (const cenario of ["lento", "fora"] as const) test(`site ${cenario}: atravessa o wizard até o funil sem esperar a leitura`, async ({ page }) => {
  const fixture = await novaOrganizacao(page);
  try {
    await boasVindas(page, `${cenario}.onboarding-site.test`);
    const inicio = performance.now();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    // O leitor tem timeout de 6s. Só afirmar que chegou algum dia deixaria
    // passar uma action que aguardasse ESSE timeout antes de responder.
    // Aqui o teto inclui o próprio clique e fica abaixo do timeout do leitor.
    await expect(page).toHaveURL(/\/onboarding\/setup-ai/, { timeout: 5_000 });
    const duracaoMs = performance.now() - inicio;
    expect(duracaoMs, "welcome deve terminar antes dos 6s do leitor").toBeLessThan(5_000);
    await expect.poll(() => hits.filter(hit => hit.startsWith(`/${cenario}.onboarding-site.test/`)).length).toBeGreaterThan(0);
    if (cenario === "lento") {
      const leitura = await fixture.svc.from("ai_knowledge_sources").select("status").eq("organization_id", fixture.org).eq("source_type", "site").single();
      conferir(leitura); expect(leitura.data?.status).toBe("building");
    }
    await test.info().attach(`tempo-welcome-${cenario}`, { body: JSON.stringify({ duracaoMs, siteRespondeu: false }), contentType: "application/json" });
    await irAteFunil(page, fixture.canal);
    await expect(page.getByText(/^Li o seu site/)).toHaveCount(0);
    await medir(page, `funil-site-${cenario}`);
    await finalizarQuadro(page);
    await expect(page.getByRole("region", { name: "Também preparei, do seu site:", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Começar a usar", exact: true }).click();
    await expect(page).toHaveURL(/\/app\//);
    await expect.poll(async () => {
      const fonte = await fixture.svc.from("ai_knowledge_sources").select("status,last_index_status").eq("organization_id", fixture.org).eq("source_type", "site").maybeSingle();
      conferir(fonte); return fonte.data?.status;
    }, { timeout: 30_000 }).toBe("failed");
  } finally { await fixture.limpar(); }
});

for (const escolha of ["revisar", "depois"] as const) test(`site lido: ${escolha} é uma saída real e confirmar libera só o produto conferido`, async ({ page }) => {
  const fixture = await novaOrganizacao(page);
  try {
    await boasVindas(page, "valido.onboarding-site.test");
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(page).toHaveURL(/\/onboarding\/setup-ai/);
    await expect.poll(async () => {
      const produtos = await fixture.svc.from("catalog_products").select("id").eq("organization_id", fixture.org).eq("origem", "site");
      conferir(produtos); return produtos.data?.length ?? 0;
    }, { timeout: 30_000 }).toBe(1);
    const produtos = await fixture.svc.from("catalog_products").select("id,nome,preco_cents,ativo").eq("organization_id", fixture.org).eq("origem", "site");
    conferir(produtos);
    expect(produtos.data).toEqual([expect.objectContaining({ nome: "Consulta inicial de demonstração", preco_cents: 12990, ativo: false })]);
    await irAteFunil(page, fixture.canal);
    await expect(page.getByText(/Li o seu site \(https:\/\/valido\.onboarding-site\.test\/?\)/)).toBeVisible();
    expect(chamadasIa.some(call => JSON.stringify(call).includes("DADOS_DO_SITE") && JSON.stringify(call).includes("valido.onboarding-site.test"))).toBe(true);
    await finalizarQuadro(page);
    const cartao = page.getByRole("region", { name: "Também preparei, do seu site:", exact: true });
    await expect(cartao).toContainText("1 produtos com preço — aguardando sua conferência");
    await expect(cartao).toContainText("1 perguntas frequentes — aguardando sua conferência");
    await medir(page, `done-rascunhos-${escolha}`);
    await cartao.getByRole("button", { name: "Revisar agora", exact: true }).click();
    await expect(cartao.getByRole("button", { name: "Conferir perguntas frequentes", exact: true })).toBeVisible();
    if (escolha === "revisar") {
      await cartao.getByRole("button", { name: "Conferir produtos e preços", exact: true }).click();
      await expect(page).toHaveURL(/\/app\/products$/);
    } else {
      await cartao.getByRole("button", { name: "Depois", exact: true }).click();
      await expect(cartao).toHaveCount(0);
      await page.reload();
      await expect(cartao).toHaveCount(0);
      await page.getByRole("button", { name: "Começar a usar", exact: true }).click();
      await expect(page).toHaveURL(/\/app\//);
      await page.goto("/app/products");
    }
    await expect(page.getByText("do seu site — confira o preço", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Confirmar todos", exact: true }).click();
    await expect.poll(async () => {
      const read = await fixture.svc.from("catalog_products").select("ativo").eq("organization_id", fixture.org).eq("id", produtos.data![0]!.id).single();
      conferir(read); return read.data?.ativo;
    }).toBe(true);
    if (escolha === "revisar") {
      const fonte = await fixture.svc.from("ai_knowledge_sources").select("id,is_active").eq("organization_id", fixture.org).eq("source_type", "site").single();
      conferir(fonte); expect(fonte.data?.is_active).toBe(false);
      const sourceId = fonte.data!.id as string;
      await page.goto("/app/ai/knowledge/sources");
      const material = page.getByTestId(`material-${sourceId}`);
      await expect(material).toContainText("As perguntas do site ainda não são usadas pelo agente.");
      await medir(page, "material-aguardando-revisao");
      const caixaDoMaterial = await material.evaluate(el => {
        const caixa = el.getBoundingClientRect();
        return { x: caixa.x, largura: caixa.width, direita: caixa.right, tela: innerWidth, fonte: getComputedStyle(el).fontSize };
      });
      expect(caixaDoMaterial.tela).toBe(390);
      expect(caixaDoMaterial.x).toBeGreaterThanOrEqual(0);
      expect(caixaDoMaterial.direita).toBeLessThanOrEqual(390);
      await test.info().attach("card-perguntas-390-medidas", { body: JSON.stringify(caixaDoMaterial), contentType: "application/json" });
      await material.getByRole("button", { name: "Revisar perguntas", exact: true }).click();
      const dialogo = page.getByRole("dialog");
      const texto = dialogo.getByLabel("Conteúdo", { exact: true });
      await expect(texto).toHaveValue(/Como marcar uma consulta\?/);
      const confirmar = dialogo.getByRole("button", { name: "Confirmar perguntas", exact: true });
      await expect(confirmar).toBeDisabled();
      const perguntaConferida = { question: "Como marcar uma consulta?", answer: "Fale com a recepção para conferir um horário; resposta revisada no teste local." };
      await texto.fill(`## Pergunta: ${perguntaConferida.question}\n## Resposta: ${perguntaConferida.answer}`);
      await dialogo.getByRole("checkbox", { name: "Conferi as perguntas e respostas e autorizo o uso pelo agente.", exact: true }).check();
      await expect(confirmar).toBeEnabled();
      const patch = page.waitForResponse(r => r.url().endsWith(`/api/v1/ai/knowledge/sources/${sourceId}`) && r.request().method() === "PATCH");
      await confirmar.click();
      expect((await patch).status()).toBe(200);
      await expect(dialogo).toHaveCount(0);
      const revisada = await fixture.svc.from("ai_knowledge_sources").select("is_active,source_metadata,chunks_count,active_kb_version_id").eq("organization_id", fixture.org).eq("id", sourceId).single();
      conferir(revisada); expect(revisada.data?.is_active).toBe(true);
      const carimbo = (revisada.data?.source_metadata as { site: { revisadoEm: string; revisadoPor: string; revisaoConteudoHash: string } }).site;
      expect(Number.isNaN(Date.parse(carimbo.revisadoEm))).toBe(false);
      expect(carimbo.revisadoPor).toBe(fixture.user);
      expect(carimbo.revisaoConteudoHash).toBe(createHash("sha256").update(JSON.stringify([perguntaConferida])).digest("hex"));
      const perguntas = await fixture.svc.from("ai_faq_items").select("question,answer").eq("organization_id", fixture.org).eq("knowledge_source_id", sourceId).order("position");
      conferir(perguntas); expect(perguntas.data).toEqual([perguntaConferida]);
      // Nenhum drain/embedding foi executado nesta prova: confirmação é uma
      // fronteira; preparação para busca é a outra, vigiada pelo worker.
      expect(revisada.data?.chunks_count).toBe(0);
      expect(revisada.data?.active_kb_version_id).toBeNull();
    }
  } finally { await fixture.limpar(); }
});
