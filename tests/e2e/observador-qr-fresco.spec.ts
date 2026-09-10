import { existsSync, readFileSync, statSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { coletarMedidasSeguras, persistirMedidasSeguras } from "./utils/evidencia-fresca";
import { iniciarObservadorQr } from "./utils/observador-qr";
import { criarArquivoTemporarioPrivado } from "./utils/seguranca-da-prova-fresca";

const QR_FICTICIO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40'/%3E%3C/svg%3E";

test("observador encerra e libera o QR privado quando a imagem some", async ({ page }) => {
  const temporario = criarArquivoTemporarioPrivado("qr-ficticio.png");
  let encerrar: (() => Promise<void>) | undefined;
  try {
    await page.setContent(`<main><img id="qr" src="${QR_FICTICIO}" alt="QR fictício"></main>`);
    const observador = await iniciarObservadorQr({
      qr: page.locator("#qr"),
      arquivo: temporario.arquivo,
      intervaloMs: 10,
      timeoutDaOperacaoMs: 1_000,
      aoCapturar: () => undefined,
    });
    encerrar = observador.encerrar;

    await page.locator("#qr").evaluate((elemento) => elemento.remove());
    await page.waitForTimeout(50);
    const inicio = performance.now();
    await observador.encerrar();
    const duracao = performance.now() - inicio;

    expect(duracao).toBeLessThan(250);
    temporario.limpar();
    expect(existsSync(temporario.diretorio)).toBe(false);
  } finally {
    await encerrar?.();
    temporario.limpar();
  }
});

test("medidas sanitizadas persistem em JSON 0600 anexado por path", async ({ page }, testInfo) => {
  const marcadorSensivel = crypto.randomUUID();
  await page.setContent(`
    <main>
      <p>${marcadorSensivel}</p>
      <img src="https://segredo.invalid/${marcadorSensivel}" width="40" height="40" alt="${marcadorSensivel}">
    </main>
  `);

  const medidas = await coletarMedidasSeguras(page);
  const arquivo = await persistirMedidasSeguras(testInfo, "medidas-ficticias", medidas);
  const conteudo = readFileSync(arquivo, "utf8");
  const attachment = testInfo.attachments.find((item) => item.name === "medidas-ficticias");

  expect(existsSync(arquivo)).toBe(true);
  expect(statSync(arquivo).mode & 0o777).toBe(0o600);
  expect(JSON.parse(conteudo)).toEqual(medidas);
  expect(conteudo.includes(marcadorSensivel)).toBe(false);
  expect(attachment?.body).toBeUndefined();
  expect(typeof attachment?.path).toBe("string");
  expect(existsSync(attachment!.path!)).toBe(true);
});
