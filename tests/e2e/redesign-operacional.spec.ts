/**
 * Prova pela tela do redesign operacional.
 *
 * A personalização usa o banco real do ambiente E2E e devolve o estado padrão
 * ao final. O copiloto usa resposta determinística na borda HTTP: a rota e o
 * executor têm testes próprios, enquanto esta spec mede navegação, composição,
 * acessibilidade e fontes sem gastar crédito de provedor no CI.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  credenciaisSupabaseDeTeste,
  destinoEhLocal,
} from "../../scripts/lib/env-de-teste";
import { lerCreds, loginComoAdmin, type CredsE2E } from "./helpers/login-admin";

const EVIDENCE = path.join(process.cwd(), ".superpowers", "evidence", "redesign-operacional");
const NOCTURNE_EVIDENCE = path.join(
  process.cwd(),
  ".superpowers",
  "evidence",
  "nocturne-telas",
);
mkdirSync(EVIDENCE, { recursive: true });
mkdirSync(NOCTURNE_EVIDENCE, { recursive: true });

let creds: CredsE2E;

type NocturneRole = "agent" | "manager" | "admin";

interface NocturneCreds extends CredsE2E {
  org_id: string;
  users: Record<string, { id: string; email: string; role: string }>;
  queue: { conversation_id: string };
  kanban: { pipeline_id: string };
  crm_vivo: {
    pipeline_id: string;
    stage_ids: Record<string, string>;
    lead_ids: Record<string, string>;
  };
}

let nocturneCreds: NocturneCreds;

interface OperationalGoalsSnapshot {
  present: boolean;
  value?: unknown;
}

let originalOperationalGoals: OperationalGoalsSnapshot | undefined;

function settingsObject(settings: unknown): Record<string, unknown> {
  return settings !== null && typeof settings === "object" && !Array.isArray(settings)
    ? (settings as Record<string, unknown>)
    : {};
}

function operationalGoalsFromSettings(settings: Record<string, unknown>): OperationalGoalsSnapshot {
  const present = Object.prototype.hasOwnProperty.call(settings, "operational_goals");
  return {
    present,
    ...(present ? { value: structuredClone(settings.operational_goals) } : {}),
  };
}

function adminDoE2E() {
  const local = credenciaisSupabaseDeTeste();
  if (!destinoEhLocal(local.url)) {
    throw new Error(`redesign-operacional recusou Supabase não local: ${new URL(local.url).host}`);
  }
  return createClient(local.url, local.serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function readOperationalGoals(): Promise<OperationalGoalsSnapshot> {
  const { data, error } = await adminDoE2E()
    .from("organizations")
    .select("settings")
    .eq("id", nocturneCreds.org_id)
    .maybeSingle();
  if (error) throw new Error(`não foi possível ler as metas originais: ${error.message}`);
  if (!data) throw new Error("organização E2E não encontrada ao ler metas originais");

  return operationalGoalsFromSettings(settingsObject(data.settings));
}

async function restoreOperationalGoals(): Promise<void> {
  if (!originalOperationalGoals) return;

  const admin = adminDoE2E();
  let restored = false;
  for (let attempt = 0; attempt < 3 && !restored; attempt += 1) {
    const { data, error } = await admin
      .from("organizations")
      .select("settings")
      .eq("id", nocturneCreds.org_id)
      .maybeSingle();
    if (error) throw new Error(`não foi possível ler settings para restaurar metas: ${error.message}`);
    if (!data) throw new Error("organização E2E não encontrada ao restaurar metas");

    const currentSettings = settingsObject(data.settings);
    if (isDeepStrictEqual(operationalGoalsFromSettings(currentSettings), originalOperationalGoals)) {
      restored = true;
      break;
    }
    const nextSettings = { ...currentSettings };
    if (originalOperationalGoals.present) {
      nextSettings.operational_goals = structuredClone(originalOperationalGoals.value);
    } else {
      delete nextSettings.operational_goals;
    }

    const { data: updated, error: updateError } = await admin
      .from("organizations")
      .update({ settings: nextSettings })
      .eq("id", nocturneCreds.org_id)
      .eq("settings", JSON.stringify(currentSettings))
      .select("id");
    if (updateError) {
      throw new Error(`não foi possível restaurar metas originais: ${updateError.message}`);
    }
    restored = (updated ?? []).length === 1;
  }
  if (!restored) throw new Error("settings mudou durante as três tentativas de restaurar metas");

  const after = await readOperationalGoals();
  expect(after, "operational_goals deve voltar byte a byte ao estado de entrada").toEqual(
    originalOperationalGoals,
  );
}

test.describe.configure({ timeout: 120_000 });

test.beforeAll(async () => {
  creds = lerCreds();
  for (const script of [
    "scripts/seed-e2e-queue.ts",
    "scripts/seed-e2e-kanban.ts",
    "scripts/seed-crm-vivo.ts",
  ]) {
    execFileSync("npx", ["tsx", script], { stdio: "inherit", env: process.env });
  }
  nocturneCreds = JSON.parse(
    readFileSync(path.join(process.cwd(), ".e2e-creds.json"), "utf8"),
  ) as NocturneCreds;
  originalOperationalGoals = await readOperationalGoals();
});

test.afterAll(async () => {
  let restoreError: unknown;
  try {
    // Rede de segurança para falha no meio do teste: restaura somente a chave
    // operational_goals sobre o settings atual, sem apagar branding/routing/etc.
    await restoreOperationalGoals();
  } catch (error) {
    restoreError = error;
  }

  try {
    // A jornada move e ganha um negócio real. O seed é idempotente e devolve o
    // board ao mesmo estado de entrada para a próxima spec do banco compartilhado.
    execFileSync("npx", ["tsx", "scripts/seed-crm-vivo.ts"], {
      stdio: "inherit",
      env: process.env,
    });
  } catch (seedError) {
    if (restoreError) throw new AggregateError([restoreError, seedError], "restaurações E2E falharam");
    throw seedError;
  }
  if (restoreError) throw restoreError;
});

test.beforeEach(async ({ page }) => {
  creds = await loginComoAdmin(page, creds);
});

async function loginComo(page: Page, role: Exclude<NocturneRole, "admin">): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.locator("#email").fill(nocturneCreds.users[role]!.email);
  await page.locator("#password").fill(nocturneCreds.password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/app(?:\/|$)/, { timeout: 30_000 });
}

async function usarTemaClaro(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.setItem("deskcomm-theme", "light"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
}

async function capturarPainelPorPapel(page: Page, role: NocturneRole): Promise<void> {
  const summaryResponse = page.waitForResponse(
    (response) => response.url().includes("/api/v1/dashboard/summary") && response.ok(),
  );
  await page.goto("/app");
  const payload = (await (await summaryResponse).json()) as {
    data: {
      role_surface: NocturneRole;
      hero: { id: string; label: string; value: string | number };
      cards: Array<{ id: string; label: string; value: string | number }>;
    };
  };
  expect(payload.data.role_surface).toBe(role);
  await usarTemaClaro(page);

  const summary = page.getByRole("region", { name: "Resumo operacional" });
  await expect(summary).toBeVisible({ timeout: 30_000 });
  await expect(summary.getByRole("heading", { name: payload.data.hero.label })).toBeVisible();

  const valoresEsperados = [payload.data.hero, ...payload.data.cards].map((item) => ({
    id: item.id,
    value: String(item.value),
  }));
  for (const item of valoresEsperados) {
    await expect(page.getByTestId(`dashboard-value-${item.id}`)).toHaveText(item.value);
  }
  expect(valoresEsperados.map((item) => item.value)).not.toContain("R$ 8.940");

  const heroValue = String(payload.data.hero.value);
  const titulo = {
    agent: `${heroValue} conversas esperando resposta`,
    manager: `Pipeline de ${heroValue} em jogo`,
    admin: `${heroValue.replace("/", " de ")} instâncias conectadas`,
  }[role];
  await expect(page.getByRole("heading", { level: 1, name: titulo })).toBeVisible();

  const cta = {
    agent: { name: "Abrir a fila", href: "/app/inbox" },
    manager: { name: "Revisar funil", href: "/app/kanban" },
    admin: { name: "Ver instâncias", href: "/app/connections" },
  }[role];
  await expect(page.getByRole("link", { name: cta.name })).toHaveAttribute("href", cta.href);

  const measured = await page.evaluate(() => {
    const main = document.querySelector("main");
    return {
      href: location.href,
      theme: document.documentElement.dataset.theme ?? null,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      dashboardBackground: main ? getComputedStyle(main).backgroundColor : null,
    };
  });
  expect(measured.bodyBackground).toBeTruthy();
  expect(measured.dashboardBackground).toBeTruthy();

  const screenshotPath = path.join(NOCTURNE_EVIDENCE, `dashboard-${role}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const screenshotSha256 = createHash("sha256")
    .update(readFileSync(screenshotPath))
    .digest("hex");
  writeFileSync(
    path.join(NOCTURNE_EVIDENCE, `dashboard-${role}.json`),
    `${JSON.stringify(
      {
        role,
        screenshot_sha256: screenshotSha256,
        captured_at: new Date().toISOString(),
        values_from_database: valoresEsperados,
        ...measured,
      },
      null,
      2,
    )}\n`,
  );
}

test("a barra lateral permanece fixa enquanto somente o conteúdo rola", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app");
  await expect(page.getByRole("region", { name: "Resumo operacional" })).toBeVisible({
    timeout: 30_000,
  });

  const aside = page.locator("aside").first();
  const main = page.locator("main").first();
  const topoAntes = await aside.evaluate((element) => element.getBoundingClientRect().top);

  await main.evaluate((element) => {
    element.scrollTop = Math.min(500, element.scrollHeight - element.clientHeight);
  });

  await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const medida = await page.evaluate(() => ({
    pagina: window.scrollY,
    topoDaBarra: document.querySelector("aside")?.getBoundingClientRect().top ?? -1,
  }));

  expect(medida.pagina, "a página não deve rolar fora da casca do app").toBe(0);
  expect(medida.topoDaBarra, "a barra deve continuar encostada no topo").toBe(topoAntes);
});

async function usarIdioma(page: Page, idioma: "pt-BR" | "es"): Promise<void> {
  const curto = idioma === "es" ? "ES" : "PT";
  const seletor = page.getByTestId("seletor-de-idioma");
  if ((await seletor.innerText()).trim() === curto) return;

  await page.evaluate(() => {
    (window as unknown as { __antesDaTroca?: boolean }).__antesDaTroca = true;
  });
  await seletor.click();
  await page.getByTestId(`idioma-${idioma}`).click();
  await page.waitForFunction(
    () => !(window as unknown as { __antesDaTroca?: boolean }).__antesDaTroca,
    undefined,
    { timeout: 30_000 },
  );
  await expect(seletor).toHaveText(curto);
}

async function expectSemOverflowHorizontal(page: Page): Promise<void> {
  const largura = await page.evaluate(() => ({
    // A barra contextual é um carrossel horizontal deliberado. Seus filhos
    // podem ficar além da viewport DENTRO dela; o defeito seria essa largura
    // escapar para o body e mover a página inteira.
    pagina: document.body.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(
    largura.pagina,
    `o body (${largura.pagina}px) não pode ultrapassar a viewport (${largura.viewport}px)`,
  ).toBeLessThanOrEqual(largura.viewport + 1);
}

test("o painel salva, reaplica e restaura a personalização", async ({ page }) => {
  await page.request.delete("/api/v1/dashboard/preferences");
  await page.goto("/app");
  await expect(page.getByRole("region", { name: "Resumo operacional" })).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: "Personalizar painel" }).click();
  const dialog = page.getByRole("dialog", { name: "Personalizar painel" });
  const fila = dialog.getByTestId("dashboard-editor-service_queue");
  const conversas = dialog.getByTestId("dashboard-editor-recent_conversations");

  await conversas.dragTo(fila);
  await dialog
    .getByRole("slider", { name: "Redimensionar Oportunidades por etapa" })
    .fill("2");
  await dialog
    .getByRole("switch", { name: "Exibir Clientes que precisam de atenção" })
    .click();
  await dialog.getByRole("button", { name: "Salvar painel" }).click();
  await expect(dialog).toBeHidden();

  const preferenceResponse = await page.request.get("/api/v1/dashboard/preferences");
  expect(preferenceResponse.ok()).toBe(true);
  const preference = (await preferenceResponse.json()) as {
    data: { layout: { widgets: Array<{ id: string; size: string }> } };
  };
  expect(preference.data.layout.widgets.slice(0, 3).map((widget) => widget.id)).toEqual([
    "conversation_summary",
    "recent_conversations",
    "service_queue",
  ]);
  expect(
    preference.data.layout.widgets.find((widget) => widget.id === "opportunities_by_stage")?.size,
  ).toBe("full");

  await page.reload();
  await expect(page.getByRole("region", { name: "Resumo operacional" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Clientes que precisam de atenção" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Personalizar painel" }).click();
  await page
    .getByRole("dialog", { name: "Personalizar painel" })
    .getByRole("button", { name: "Restaurar padrão" })
    .click();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Clientes que precisam de atenção" }),
  ).toBeVisible();

  await page.screenshot({ path: path.join(EVIDENCE, "painel-personalizavel.png"), fullPage: true });
});

test("Pergunte à IA aguarda 12 segundos, responde com fontes e não repete a consulta", async ({
  page,
}) => {
  let consultas = 0;
  await page.route("**/api/v1/ai/ask", async (route) => {
    consultas += 1;
    expect(route.request().method()).toBe("POST");
    await new Promise((resolve) => setTimeout(resolve, 12_000));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          answer: "Existem três oportunidades abertas e uma precisa de atenção hoje.",
          sources: [
            { kind: "lead", label: "Oportunidades", href: "/app/kanban" },
            { kind: "risk", label: "Radar", href: "/app/radar" },
          ],
          consulted_tools: ["crm_list_leads", "crm_list_at_risk_leads"],
        },
      }),
    });
  });

  await page.goto("/app");
  await page.getByRole("link", { name: "Pergunte à IA" }).click();
  await expect(page).toHaveURL(/\/app\/ai\/ask$/);
  await expect(page.getByText("Somente leitura")).toBeVisible();

  await page.getByRole("button", { name: "Quais clientes precisam de atenção hoje?" }).click();
  await expect(page.getByText(/três oportunidades abertas/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("link", { name: "Oportunidades" })).toHaveAttribute(
    "href",
    "/app/kanban",
  );
  await expect(page.getByRole("link", { name: "Radar" })).toHaveAttribute("href", "/app/radar");
  expect(consultas).toBe(1);
  await expect(page.getByRole("button", { name: /mover oportunidade/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /enviar mensagem/i })).toHaveCount(0);

  await page.screenshot({ path: path.join(EVIDENCE, "pergunte-a-ia.png"), fullPage: true });
});

test("o sistema operacional preserva hierarquia em temas, idiomas e viewports", async ({
  page,
}) => {
  // O SO só dirige o tema quando a pessoa escolheu "system"; o padrão é claro.
  await page.addInitScript(() => localStorage.setItem("deskcomm-theme", "system"));
  try {
    await usarIdioma(page, "pt-BR");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/app/contacts");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.getByRole("heading", { name: "Contatos", level: 1 })).toBeVisible();
    await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 30_000 });
    await expectSemOverflowHorizontal(page);
    await page.screenshot({
      path: path.join(EVIDENCE, "contatos-desktop-pt-light.png"),
      fullPage: true,
    });

    await page.setViewportSize({ width: 820, height: 1180 });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/app/kanban");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("heading", { name: "Funis", level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    await expectSemOverflowHorizontal(page);
    await page.screenshot({
      path: path.join(EVIDENCE, "funis-tablet-pt-dark.png"),
      fullPage: true,
    });

    await usarIdioma(page, "es");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/app/ai/agents");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.getByText("AUTOMATIZACIÓN INTELIGENTE")).toBeVisible();
    await expectSemOverflowHorizontal(page);
    await page.screenshot({
      path: path.join(EVIDENCE, "agentes-desktop-es-light.png"),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/app/ai/ask");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("heading", { name: "Pregúntale a la IA" })).toBeVisible();
    await expectSemOverflowHorizontal(page);
    await page.screenshot({
      path: path.join(EVIDENCE, "copiloto-mobile-es-dark.png"),
      fullPage: true,
    });
  } finally {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/app");
    await usarIdioma(page, "pt-BR");
  }
});

test("o painel usa a composição e os números reais de cada papel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // O beforeEach já deixou a sessão de admin pronta. Não há mutação entre as
  // três capturas: todos enxergam o MESMO snapshot do banco, recortado pelo papel.
  await capturarPainelPorPapel(page, "admin");
  await loginComo(page, "manager");
  await capturarPainelPorPapel(page, "manager");
  await loginComo(page, "agent");
  await capturarPainelPorPapel(page, "agent");
});

test("a sugestão da IA preenche o composer para edição sem enviar", async ({ page }) => {
  const sugestoes = [
    "Posso confirmar os detalhes do seu pedido.",
    "Vou verificar isso para você agora.",
    "Quer que eu encaminhe para uma pessoa da equipe?",
  ];
  const sugestaoEscolhida = sugestoes[1]!;
  let chamadasDeSugestao = 0;
  let envios = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/v1/messages") {
      envios += 1;
    }
  });
  await page.route("**/api/v1/conversations/*/draft-reply", async (route) => {
    chamadasDeSugestao += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { suggestions: sugestoes } }),
    });
  });

  await loginComo(page, "agent");
  await page.goto(`/app/inbox?id=${encodeURIComponent(nocturneCreds.queue.conversation_id)}`);
  const composer = page.getByLabel("Mensagem");
  await expect(composer).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Sugerir resposta" }).click();
  await expect(page.getByRole("button", { name: sugestaoEscolhida })).toBeVisible();
  await page.getByRole("button", { name: sugestaoEscolhida }).click();
  await expect(composer).toHaveValue(sugestaoEscolhida);
  await composer.fill(`${sugestaoEscolhida} Obrigado.`);
  await page.waitForTimeout(250);

  expect(chamadasDeSugestao).toBe(1);
  expect(envios, "clicar e editar uma sugestão nunca envia por conta própria").toBe(0);
});

test("as abas de funil preservam contexto e os botões avançam e ganham o negócio", async ({
  page,
}) => {
  await loginComo(page, "manager");
  await page.goto(`/app/kanban?pipeline=${encodeURIComponent(nocturneCreds.crm_vivo.pipeline_id)}`);

  const tabs = page.getByRole("tablist", { name: "Funis" });
  await expect(tabs).toBeVisible({ timeout: 30_000 });
  await expect(tabs.getByRole("tab")).toHaveCount(2);
  await tabs.getByRole("tab", { name: "Pedidos" }).click();
  await expect(page).toHaveURL(new RegExp(`pipeline=${nocturneCreds.kanban.pipeline_id}`));
  await tabs.getByRole("tab", { name: "CRM Vivo — Clínica" }).click();
  await expect(page).toHaveURL(new RegExp(`pipeline=${nocturneCreds.crm_vivo.pipeline_id}`));
  await expect(page.getByText("Pipeline aberto").first()).toBeVisible();
  await expect(page.getByText("Ganho no mês").first()).toBeVisible();

  const lead = "Marina Costa — clareamento";
  const card = page.getByRole("group", { name: `Lead: ${lead}` });
  const coluna = (nome: string) =>
    page.getByRole("heading", { name: nome, exact: true }).locator("xpath=../..");

  await expect(coluna("Primeiro contato").getByRole("group", { name: `Lead: ${lead}` })).toBeVisible();
  const moveu = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(`/api/v1/leads/${nocturneCreds.crm_vivo.lead_ids.sem_dono}/move`) &&
      response.ok(),
  );
  await card.getByRole("button", { name: "Avançar" }).click();
  await moveu;
  await expect(coluna("Avaliação").getByRole("group", { name: `Lead: ${lead}` })).toBeVisible();

  const ganhou = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(`/api/v1/leads/${nocturneCreds.crm_vivo.lead_ids.sem_dono}/win`) &&
      response.ok(),
  );
  await page.getByRole("group", { name: `Lead: ${lead}` }).getByRole("button", { name: "Ganhar" }).click();
  await ganhou;
  await expect(coluna("Tratamento fechado").getByRole("group", { name: `Lead: ${lead}` })).toBeVisible();
});

test("gestor define metas e atendente vê o próprio recorte sem gamificação", async ({ page }) => {
  try {
    await loginComo(page, "manager");
    await page.goto("/app/metas");
    await expect(page.getByRole("heading", { name: "Metas operacionais" })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByLabel("Moeda da receita").fill("BRL");
    await page.getByLabel("Receita mensal da equipe").fill("5000000");
    await page.getByLabel("Conversas da equipe").fill("80");
    await page.getByLabel("Receita mensal de E2E Agent").fill("1200000");
    await page.getByLabel("Conversas de E2E Agent").fill("20");
    const salvou = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        response.url().includes("/api/v1/settings/goals") &&
        response.ok(),
    );
    await page.getByRole("button", { name: "Salvar metas" }).click();
    await salvou;

    await loginComo(page, "agent");
    await page.goto("/app/metas");
    await expect(page.getByRole("heading", { name: "Seu resumo" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("heading", { name: "Configurar metas" })).toHaveCount(0);
    await expect(page.getByText(/de R\$\s*12\.000/).first()).toBeVisible();
    await expect(page.getByText(/0 de 20/).first()).toBeVisible();
    await expect(page.locator("main")).not.toContainText(
      /\b(?:XP|nível|ofensiva|desafios?|ranking|medalhas?)\b/i,
    );
  } finally {
    // `finally` executa também quando uma asserção da jornada falha. O helper
    // compara o snapshot restaurado e o afterAll repete a operação como cinto.
    await restoreOperationalGoals();
  }
});
