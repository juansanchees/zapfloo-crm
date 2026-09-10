/**
 * Onboarding do dono em instalação realmente fresca.
 *
 * Esta spec NÃO prepara o ambiente: não semeia, não reseta e não apaga banco,
 * sessão WAHA ou MFA. O bootstrap, o build/start saneado, WAHA e Redis são
 * responsabilidade externa. O banco é usado somente como leitura de prova.
 * O scan manual acontece neste mesmo teste/contexto que gerou o QR.
 */
import { expect, test, type BrowserContext, type Locator, type Page, type TestInfo } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../../lib/database.types";
import { criarArquivoTemporarioPrivado } from "./utils/seguranca-da-prova-fresca";
import { generateTotp, msUntilNextTotpWindow } from "./utils/totp";

const OWNER_EMAIL = process.env.OWNER_EMAIL!;
const OWNER_PASSWORD = process.env.OWNER_PASSWORD!;
const CHAVES_OPCIONAIS = [
  "RESEND_API_KEY",
  "AI_GATEWAY_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
] as const;

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(OWNER_EMAIL);
  await page.locator("#password").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

async function semCookieDeExploracao(context: BrowserContext): Promise<void> {
  const ausente = (await context.cookies()).every((cookie) => cookie.name !== "onboarding_explore");
  expect(ausente, "o contexto fresco não pode herdar a preferência temporária de exploração").toBe(true);
}

function mascarasSensiveis(page: Page) {
  return [
    page.locator('img[src*="/qr"], img[alt*="QR code"]'),
    page.locator('input[type="tel"]'),
    page.locator("code"),
    page.locator(".font-mono"),
  ];
}

async function screenshotMascarado(page: Page, testInfo: TestInfo, nome: string): Promise<void> {
  await page.screenshot({
    path: testInfo.outputPath(`${nome}.png`),
    fullPage: true,
    mask: mascarasSensiveis(page),
    maskColor: "#111827",
  });
}

async function medirConexao(page: Page, testInfo: TestInfo, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 1000 });
  await expect(page.getByRole("heading", { name: "Conecte seu WhatsApp" })).toBeVisible();
  const medidas = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll("main h2, main h3, main p, main label, main button, main a, main img")]
      .map((elemento) => {
        const rect = elemento.getBoundingClientRect();
        const estilo = getComputedStyle(elemento);
        return {
          texto: elemento.textContent?.slice(0, 70) ?? "",
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
          fontSize: estilo.fontSize,
          lineHeight: estilo.lineHeight,
          display: estilo.display,
          naturalWidth: elemento instanceof HTMLImageElement ? elemento.naturalWidth : null,
          naturalHeight: elemento instanceof HTMLImageElement ? elemento.naturalHeight : null,
        };
      });
    return { viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth, boxes };
  });
  expect(medidas.scrollWidth, `overflow em ${width}px`).toBeLessThanOrEqual(width + 1);
  for (const box of medidas.boxes.filter((item) => item.width > 0)) {
    expect(box.left, `${box.texto}: esquerda em ${width}px`).toBeGreaterThanOrEqual(-1);
    expect(box.right, `${box.texto}: direita em ${width}px`).toBeLessThanOrEqual(width + 1);
  }
  await testInfo.attach(`medidas-conexao-${width}`, {
    body: JSON.stringify(medidas, null, 2),
    contentType: "application/json",
  });
  await screenshotMascarado(page, testInfo, `conexao-${width}`);
}

async function preencherTotp(page: Page, secret: string): Promise<void> {
  if (msUntilNextTotpWindow() < 4_000) {
    await page.waitForTimeout(msUntilNextTotpWindow() + 300);
  }
  await page.locator('input[aria-label="Dígito 1"]').click();
  await page.keyboard.type(generateTotp(secret), { delay: 40 });
}

async function limparEntradaTotp(page: Page): Promise<void> {
  await page.locator('input[aria-label="Dígito 1"]').click();
  for (let i = 0; i < 6; i += 1) await page.keyboard.press("Backspace");
}

async function esperarVisivelSemSnapshot(page: Page, locator: Locator, timeout: number): Promise<boolean> {
  const limite = Date.now() + timeout;
  while (Date.now() < limite) {
    if (await locator.isVisible()) return true;
    await page.waitForTimeout(200);
  }
  return false;
}

async function confirmarEnrollTotp(page: Page, secret: string): Promise<void> {
  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    await preencherTotp(page, secret);
    const chegou = await esperarVisivelSemSnapshot(
      page,
      page.getByRole("heading", { name: "Códigos de recuperação", exact: true }),
      8_000,
    );
    if (chegou) return;
    if (tentativa === 2) throw new Error("MFA enroll não chegou aos códigos de recuperação após 3 tentativas.");
    await limparEntradaTotp(page);
    await page.waitForTimeout(msUntilNextTotpWindow() + 300);
  }
}

async function confirmarLoginTotp(page: Page, secret: string): Promise<void> {
  // O código usado no enroll não pode ser reutilizado no login seguinte.
  await page.waitForTimeout(msUntilNextTotpWindow() + 300);
  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    await preencherTotp(page, secret);
    const chegou = await page.waitForURL(/\/app\/inbox/, { timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (chegou) return;
    if (tentativa === 2) throw new Error("MFA login não chegou ao Inbox após 3 tentativas.");
    await limparEntradaTotp(page);
    await page.waitForTimeout(msUntilNextTotpWindow() + 300);
  }
}

test("bootstrap novo conecta QR real, conclui sem IA e preserva convite, MFA e reentrada", async ({
  browser,
  page,
}, testInfo) => {
  test.setTimeout(16 * 60_000);
  expect(
    process.env.PLAYWRIGHT_NO_COPY_PROMPT === "1",
    "a fresh precisa desativar o snapshot DOM automático do Playwright",
  ).toBe(true);
  for (const chave of CHAVES_OPCIONAIS) {
    const ausente = process.env[chave] === undefined;
    expect(ausente, `${chave} precisa estar ausente no runner fresco`).toBe(true);
  }

  const svc = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const usuarios = await svc.auth.admin.listUsers({ page: 1, perPage: 50 });
  if (usuarios.error) throw usuarios.error;
  expect(usuarios.data.users).toHaveLength(1);
  const dono = usuarios.data.users[0]!;
  expect(dono.email === OWNER_EMAIL, "o único usuário precisa ser o dono fictício configurado").toBe(true);

  // `head/count` recusa qualquer organização extra sem trazer seus dados para
  // a memória ou para uma mensagem de falha. O filtro seguinte resolve a única
  // linha pelo dono, em vez de escolher implicitamente "a primeira".
  const totalDeOrganizacoes = await svc.from("organizations")
    .select("id", { count: "exact", head: true })
    .or("id.not.is.null");
  if (totalDeOrganizacoes.error) throw totalDeOrganizacoes.error;
  expect(totalDeOrganizacoes.count === 1, "o banco fresco precisa ter exatamente uma organização").toBe(true);
  const organizacoes = await svc.from("organizations")
    .select("id,created_by,display_name,settings,onboarded_at,onboarding_state")
    .eq("created_by", dono.id);
  if (organizacoes.error) throw organizacoes.error;
  expect(organizacoes.data).toHaveLength(1);
  const org = organizacoes.data[0]!;
  expect(org.created_by).toBe(dono.id);
  expect(org.onboarded_at).toBeNull();
  expect(org.onboarding_state ?? {}).toEqual({});
  const provider = (org.settings as { llm?: { provider?: string } } | null)?.llm?.provider ?? "anthropic";

  const vinculos = await svc.from("user_organizations").select("user_id,organization_id,role,revoked_at").eq("user_id", dono.id);
  if (vinculos.error) throw vinculos.error;
  expect(vinculos.data).toEqual([{ user_id: dono.id, organization_id: org.id, role: "admin", revoked_at: null }]);
  for (const tabela of ["ai_agents", "ai_agent_versions", "ai_provider_credentials", "channel_sessions", "onboarding_drafts"] as const) {
    const leitura = await svc.from(tabela).select("organization_id", { count: "exact", head: true }).eq("organization_id", org.id);
    if (leitura.error) throw new Error(`preflight ${tabela} falhou (status ${leitura.status})`);
    expect(leitura.count, `${tabela} precisa começar vazia`).toBe(0);
  }
  const fatoresAntes = await svc.auth.admin.mfa.listFactors({ userId: dono.id });
  if (fatoresAntes.error) throw fatoresAntes.error;
  expect(fatoresAntes.data.factors).toHaveLength(0);

  await login(page);
  await expect(page).toHaveURL(/\/onboarding\/welcome/);
  await page.goto("/app/inbox");
  await expect(page).toHaveURL(/\/onboarding\/welcome/);

  // Sem `?provar=1`: este retrato confirma somente o provedor selecionado,
  // a origem da chave dele e o envio de e-mail no processo do app.
  const instalacao = await page.request.get("/api/v1/system/instalacao");
  expect(instalacao.status()).toBe(200);
  const retrato = (await instalacao.json()) as {
    data: { inteligencia: { provedor: string; origemDaChave: string }; email: { configurado: boolean } };
  };
  expect(retrato.data.inteligencia.provedor).toBe(provider);
  expect(retrato.data.inteligencia.origemDaChave).toBe("nenhuma");
  expect(retrato.data.email.configurado).toBe(false);

  await page.locator("#display_name").fill("Empresa fresca QA");
  await page.locator("#segmento").selectOption("servicos");
  await page.locator("#o_que_faz").fill("Atendimento humano em instalação fresca");
  const continuarWelcome = page.getByRole("button", { name: "Continuar", exact: true });
  await expect(continuarWelcome).toBeDisabled();
  await page.getByRole("checkbox").check();
  await expect(continuarWelcome).toBeEnabled();
  await continuarWelcome.click();
  await expect(page).toHaveURL(/\/onboarding\/connect-whatsapp/);

  await expect(page.getByTestId("forma-qr")).toBeVisible();
  await expect(page.getByTestId("forma-oficial")).toBeVisible();
  await expect(page.getByTestId("forma-parceiro")).toBeVisible();
  await expect(page.getByRole("link", { name: "Configurar IA (opcional)", exact: true })).toBeVisible();

  await page.getByTestId("forma-qr").locator("input").click();
  const qr = page.locator('img[src*="/api/v1/onboarding/whatsapp/qr"]');
  await expect(qr).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => qr.evaluate((imagem: HTMLImageElement) => imagem.naturalWidth), { timeout: 30_000 }).toBeGreaterThan(0);
  // Mede o bloco real com QR carregado antes de emitir o marcador ao dono.
  // Nas screenshots persistidas o QR é sempre mascarado.
  for (const width of [1440, 768, 390]) {
    await medirConexao(page, testInfo, width);
  }
  let limparQrTemporario: () => void = () => undefined;
  try {
    const qrTemporario = criarArquivoTemporarioPrivado("qr-whatsapp.png");
    limparQrTemporario = qrTemporario.limpar;
    // O lifecycle protegido começa antes da primeira operação que grava o QR.
    await qr.screenshot({ path: qrTemporario.arquivo });
    console.info(`QR_PRONTO ${qrTemporario.arquivo}`);
    let ultimaFonte = await qr.getAttribute("src");
    let pararAtualizacaoDoQr = false;
    const atualizarQrEnquantoValido = (async () => {
      while (!pararAtualizacaoDoQr && /\/onboarding\/connect-whatsapp/.test(page.url())) {
        await page.waitForTimeout(1_000);
        try {
          const fonte = await qr.getAttribute("src");
          const carregado = await qr.evaluate((imagem: HTMLImageElement) => imagem.complete && imagem.naturalWidth > 0);
          if (fonte && fonte !== ultimaFonte && carregado) {
            // O cliente renova o QR a cada tick. Sobrescrever o mesmo arquivo
            // transitório evita que o dono tente escanear uma imagem expirada.
            await qr.screenshot({ path: qrTemporario.arquivo });
            ultimaFonte = fonte;
            console.info(`QR_PRONTO ${qrTemporario.arquivo}`);
          }
        } catch {
          // A navegação após WORKING pode desmontar a imagem entre as leituras.
        }
      }
    })();
    try {
      // O dono escaneia enquanto este teste continua vivo. O produto observa
      // WORKING, conserva o UUID do POST e avança pelo escritor canônico.
      await page.waitForURL(/\/onboarding\/setup-ai/, { timeout: 10 * 60_000 });
    } finally {
      pararAtualizacaoDoQr = true;
      await atualizarQrEnquantoValido;
    }
  } finally {
    limparQrTemporario();
  }

  await page.getByRole("button", { name: "Adiar IA e continuar", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding\/funil/);
  await page.getByRole("button", { name: /usar este quadro/i }).click();
  await expect(page).toHaveURL(/\/onboarding\/invite-team/);
  await expect(page.getByText("Esta instalação ainda não envia e-mail.", { exact: true })).toBeVisible();

  const emailConvidado = "atendente-fresco@example.test";
  await page.locator("#emails").fill(emailConvidado);
  await page.getByRole("button", { name: "Enviar convites", exact: true }).click();
  const avisoSemEmail = await esperarVisivelSemSnapshot(
    page,
    page.getByText(/convite\(s\) não puderam ser enviados por email/i),
    30_000,
  );
  expect(avisoSemEmail, "o fallback sem Resend precisa ficar visível").toBe(true);
  const convite = page.locator("code", { hasText: /team\/accept-invite/ });
  expect((await convite.count()) === 1, "precisa existir exatamente um link de aceite").toBe(true);
  const conviteEmMemoria = (await convite.innerText()).trim();
  expect(/\/team\/accept-invite\/.+/.test(conviteEmMemoria), "o fallback precisa produzir um link de aceite").toBe(true);
  await screenshotMascarado(page, testInfo, "convite-sem-resend");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding\/done/);
  await screenshotMascarado(page, testInfo, "onboarding-concluido");
  await page.getByRole("button", { name: "Começar a usar", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/inbox/);

  const depois = await svc.from("organizations").select("onboarded_at,onboarding_state").eq("id", org.id).single();
  if (depois.error) throw depois.error;
  expect(depois.data.onboarded_at).not.toBeNull();
  expect(depois.data.onboarding_state).toMatchObject({
    welcome: { display_name: "Empresa fresca QA" },
    whatsapp: { status: "WORKING", channel_session_id: expect.any(String) },
    ai: { skipped: true },
    funil: expect.any(Object),
    team: { invites_sent: 1, skipped: false },
  });
  expect((depois.data.onboarding_state as { ai?: { restricted_activation?: unknown } }).ai?.restricted_activation).toBeUndefined();
  const canais = await svc.from("channel_sessions").select("id,status,organization_id").eq("organization_id", org.id);
  if (canais.error) throw canais.error;
  expect(canais.data).toHaveLength(1);
  expect(canais.data[0]).toMatchObject({ organization_id: org.id, status: "WORKING" });
  for (const tabela of ["ai_agents", "ai_agent_versions", "ai_provider_credentials"] as const) {
    const leitura = await svc.from(tabela).select("id", { count: "exact", head: true }).eq("organization_id", org.id);
    if (leitura.error) throw leitura.error;
    expect(leitura.count, `${tabela} continua vazia após adiar IA`).toBe(0);
  }
  const funis = await svc.from("crm_pipelines").select("id").eq("organization_id", org.id).eq("is_default", true).eq("is_archived", false);
  if (funis.error) throw funis.error;
  expect(funis.data).toHaveLength(1);

  // MFA continua opcional, mas o caminho escolhido pelo dono precisa chegar
  // aos recovery codes. QR, secret e códigos só vivem no DOM/memória e são
  // sempre mascarados nas evidências persistidas pelo Playwright.
  await page.goto("/app/settings/security");
  await expect(page.getByText("Desativada", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ativar", exact: true }).click();
  await page.getByRole("button", { name: "Iniciar configuração", exact: true }).click();
  const qrMfa = page.locator('img[alt="QR code para configurar autenticador"]');
  expect(
    await esperarVisivelSemSnapshot(page, qrMfa, 30_000),
    "o QR de MFA precisa ficar visível",
  ).toBe(true);
  await page.getByText(/não consegue escanear/i).click();
  const secretTotp = (await page.locator("code").innerText()).trim();
  expect(secretTotp.length > 15, "o segredo TOTP precisa existir apenas em memória").toBe(true);
  await screenshotMascarado(page, testInfo, "mfa-qr-mascarado");
  await confirmarEnrollTotp(page, secretTotp);
  expect(
    (await page.getByRole("dialog").locator(".font-mono").count()) === 10,
    "a tela precisa conter dez códigos de recuperação",
  ).toBe(true);
  await screenshotMascarado(page, testInfo, "mfa-recovery-mascarado");
  await page.getByText(/salvei meus códigos em local seguro/i).click();
  await page.getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(page.getByText("Ativada", { exact: true })).toBeVisible({ timeout: 20_000 });
  const fatoresDepois = await svc.auth.admin.mfa.listFactors({ userId: dono.id });
  if (fatoresDepois.error) throw fatoresDepois.error;
  expect(fatoresDepois.data.factors).toHaveLength(1);
  expect(fatoresDepois.data.factors.every((fator) => fator.status === "verified"), "o único fator precisa estar verificado").toBe(true);

  const reentrada = await browser.newContext({ baseURL: String(testInfo.project.use.baseURL) });
  try {
    await semCookieDeExploracao(reentrada);
    const novaPagina = await reentrada.newPage();
    await login(novaPagina);
    await expect(novaPagina).toHaveURL(/\/login\/mfa/);
    await confirmarLoginTotp(novaPagina, secretTotp);
    await novaPagina.goto("/onboarding");
    await expect(novaPagina).toHaveURL(/\/app\/inbox/);
    await semCookieDeExploracao(reentrada);
    await screenshotMascarado(novaPagina, testInfo, "reentrada-com-mfa");
  } finally {
    await reentrada.close();
  }
});
