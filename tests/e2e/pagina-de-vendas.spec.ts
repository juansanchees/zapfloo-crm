import * as fs from "node:fs";
import * as path from "node:path";
import { test, expect } from "@playwright/test";

const EVIDENCIA = path.join(process.cwd(), ".superpowers", "evidence", "pagina-de-vendas");

test.describe("página pública de vendas", () => {
  for (const viewport of [
    { width: 390, height: 844, nome: "390" },
    { width: 1280, height: 720, nome: "1280" },
  ]) {
    test(`${viewport.width}px abre sem transbordo e com os planos da configuração`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/vendas");

      await expect(page.getByRole("heading", { name: /A IA atende, qualifica e vende/i })).toBeVisible();
      await expect(page).toHaveTitle("Zapfloo — IA para atendimento e vendas no WhatsApp");
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
        "content",
        "Zapfloo — IA para atendimento e vendas no WhatsApp",
      );
      await expect(page.getByTestId("plano-basico")).toContainText("R$ 97");
      await expect(page.getByTestId("plano-essencial")).toContainText("R$ 197");
      await expect(page.getByTestId("plano-completo")).toContainText("R$ 397");
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
