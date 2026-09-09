import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { razaoDeContraste } from "@/lib/branding/contraste";

// Regressão: texto secundário/subtle sobre cards escuros ficava abaixo de AA.
// Mede as cores emitidas pelo CSS real, não snapshots da paleta escolhida.
describe("legibilidade das superfícies da interface", () => {
  const css = readFileSync("app/globals.css", "utf8");
  for (const selector of [":root", '[data-theme="dark"]']) {
    it(`preserva contraste de texto em ${selector}`, () => {
      const start = css.indexOf(`${selector} {`);
      const block = css.slice(start, css.indexOf("}", start));
      const tokens = Object.fromEntries([...block.matchAll(/(--color-[a-z-]+):\s*(#[a-f0-9]{6});/gi)].map(m => [m[1], m[2]]));
      for (const text of ["text", "text-muted", "text-subtle"]) {
        for (const surface of ["bg", "surface", "surface-elevated"]) {
          expect(razaoDeContraste(tokens[`--color-${text}`]!, tokens[`--color-${surface}`]!), `${text}/${surface}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
  }
});
