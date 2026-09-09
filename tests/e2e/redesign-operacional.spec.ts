/**
 * Prova pela tela do redesign operacional.
 *
 * A personalização usa o banco real do ambiente E2E e devolve o estado padrão
 * ao final. O copiloto usa resposta determinística na borda HTTP: a rota e o
 * executor têm testes próprios, enquanto esta spec mede navegação, composição,
 * acessibilidade e fontes sem gastar crédito de provedor no CI.
 */
import { mkdirSync } from "node:fs";
import * as path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { lerCreds, loginComoAdmin, type CredsE2E } from "./helpers/login-admin";

const EVIDENCE = path.join(process.cwd(), ".superpowers", "evidence", "redesign-operacional");
mkdirSync(EVIDENCE, { recursive: true });

let creds: CredsE2E;

test.describe.configure({ timeout: 120_000 });

test.beforeAll(() => {
  creds = lerCreds();
});

test.beforeEach(async ({ page }) => {
  creds = await loginComoAdmin(page, creds);
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
  await expect(page.getByRole("heading", { name: "Vamos fazer o dia render?" })).toBeVisible({
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
  await expect(page.getByRole("heading", { name: "Vamos fazer o dia render?" })).toBeVisible();
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

test("Pergunte à IA é alcançável, responde com fontes e permanece somente leitura", async ({
  page,
}) => {
  await page.route("**/api/v1/ai/ask", async (route) => {
    expect(route.request().method()).toBe("POST");
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
  await expect(page.getByText(/três oportunidades abertas/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Oportunidades" })).toHaveAttribute(
    "href",
    "/app/kanban",
  );
  await expect(page.getByRole("link", { name: "Radar" })).toHaveAttribute("href", "/app/radar");
  await expect(page.getByRole("button", { name: /mover oportunidade/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /enviar mensagem/i })).toHaveCount(0);

  await page.screenshot({ path: path.join(EVIDENCE, "pergunte-a-ia.png"), fullPage: true });
});

test("o sistema operacional preserva hierarquia em temas, idiomas e viewports", async ({
  page,
}) => {
  try {
    await usarIdioma(page, "pt-BR");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/app/contacts");
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
    await expect(page.getByText("AUTOMATIZACIÓN INTELIGENTE")).toBeVisible();
    await expectSemOverflowHorizontal(page);
    await page.screenshot({
      path: path.join(EVIDENCE, "agentes-desktop-es-light.png"),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/app/ai/ask");
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
