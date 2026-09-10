import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { Page, TestInfo } from "@playwright/test";

export type MedidasSeguras = {
  viewport: number;
  scrollWidth: number;
  boxes: Array<{
    alvo: string;
    left: number;
    right: number;
    width: number;
    height: number;
    fontSize: string;
    lineHeight: string;
    display: string;
    naturalWidth: number | null;
    naturalHeight: number | null;
  }>;
};

export async function coletarMedidasSeguras(page: Page): Promise<MedidasSeguras> {
  return page.evaluate(() => {
    const boxes = [...document.querySelectorAll("main h2, main h3, main p, main label, main button, main a, main img")]
      .map((elemento, indice) => {
        const rect = elemento.getBoundingClientRect();
        const estilo = getComputedStyle(elemento);
        return {
          alvo: `${elemento.tagName.toLowerCase()}:${indice}`,
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
}

export async function persistirMedidasSeguras(
  testInfo: TestInfo,
  nome: string,
  medidas: MedidasSeguras,
): Promise<string> {
  const arquivo = testInfo.outputPath(`${nome}.json`);
  mkdirSync(dirname(arquivo), { recursive: true });
  writeFileSync(arquivo, `${JSON.stringify(medidas, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(arquivo, 0o600);
  await testInfo.attach(nome, { path: arquivo, contentType: "application/json" });
  return arquivo;
}
