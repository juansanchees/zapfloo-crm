import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(
  join(process.cwd(), "components/dashboard/dashboard.module.css"),
  "utf8",
);

function regra(fonte: string, seletor: string): string {
  const escapado = seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return fonte.match(new RegExp(`${escapado}\\s*\\{([^}]+)\\}`))?.[1] ?? "";
}

describe("valor principal do dashboard", () => {
  it("reserva espaço e impede a quebra do valor no desktop", () => {
    expect(regra(css, ".summary")).toContain(
      "grid-template-columns: minmax(360px, 0.95fr) minmax(0, 2fr)",
    );
    expect(regra(css, ".heroMetric")).toContain("flex-direction: column");
    expect(regra(css, ".heroMetric strong")).toMatch(/white-space:\s*nowrap/);
    expect(regra(css, ".heroMetric strong")).toMatch(/overflow-wrap:\s*normal/);
  });

  it("permite quebra sem corte nem transbordamento no mobile", () => {
    const inicioMobile = css.indexOf("@media (max-width: 600px)");
    expect(inicioMobile).toBeGreaterThan(-1);
    const mobile = css.slice(inicioMobile);
    expect(regra(mobile, ".heroMetric strong")).toMatch(/white-space:\s*normal/);
    expect(regra(mobile, ".heroMetric strong")).toMatch(/overflow-wrap:\s*anywhere/);
    expect(regra(mobile, ".heroMetric strong")).toMatch(/max-width:\s*100%/);
  });
});
