import * as fs from "node:fs";
import * as path from "node:path";
import { test, expect } from "@playwright/test";

import { PLANOS, formatarPrecoMensal } from "../../lib/billing/planos";

const EVIDENCIA = path.join(process.cwd(), ".superpowers", "evidence", "pagina-de-vendas");
const TITULO = "Zapfloo — Atendente de IA para o WhatsApp do seu negócio";
const DESCRICAO = "A IA responde, marca horário e chama de volta quem sumiu no WhatsApp do seu pet shop, clínica ou salão. Teste grátis por 7 dias.";

test.describe("página pública de vendas", () => {
  for (const viewport of [
    { width: 390, height: 844, nome: "390" },
    { width: 1280, height: 720, nome: "1280" },
  ]) {
    test(`${viewport.width}px abre sem transbordo e com os planos da configuração`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/vendas");

      await expect(page.getByRole("heading", {
        name: "Seu WhatsApp responde, agenda e vende, mesmo quando você está ocupado.",
        exact: true,
      })).toBeVisible();
      await expect(page).toHaveTitle(TITULO);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", DESCRICAO);
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", TITULO);
      await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", DESCRICAO);
      for (const [id, plano] of Object.entries(PLANOS)) {
        await expect(page.getByTestId(`plano-${id}`)).toContainText(formatarPrecoMensal(plano.precoMensalCents));
        await expect(page.getByTestId(`plano-${id}`).getByRole("link", {
          name: "Testar grátis por 7 dias",
          exact: true,
        })).toHaveAttribute("href", "https://crm.zapfloo.tech/signup");
      }
      await expect(page.getByText("Recomendado", { exact: true })).toHaveCount(1);
      await expect(page.getByTestId("plano-essencial")).toContainText("Recomendado");
      await expect(page.getByRole("link", { name: "Falar pelo WhatsApp" })).toHaveCount(0);

      const largura = await page.evaluate(() => ({
        conteudo: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      }));
      expect(largura.conteudo).toBeLessThanOrEqual(largura.viewport);

      fs.mkdirSync(EVIDENCIA, { recursive: true });
      await page.screenshot({
        path: path.join(EVIDENCIA, `pagina-de-vendas-${viewport.nome}.png`),
        fullPage: true,
      });
    });
  }
});
