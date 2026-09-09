import { readFileSync } from "node:fs";
import * as path from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MetricCard } from "@/components/ui/metric-card";
import { OperationalPage } from "@/components/ui/operational-page";

describe("design system operacional", () => {
  it("declara a moldura, o workspace e os painéis como papéis semânticos", () => {
    const css = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");
    for (const token of ["--color-shell", "--color-workspace", "--color-panel", "--color-panel-muted"]) {
      expect(css).toContain(`${token}:`);
    }
  });

  it("oferece uma hierarquia compartilhada de página e métrica", () => {
    render(
      <OperationalPage
        eyebrow="OPERAÇÃO"
        title="Contatos"
        description="Tudo que sua equipe precisa para agir."
        actions={<button type="button">Novo contato</button>}
        toolbar={<label>Buscar <input /></label>}
      >
        <MetricCard label="Leads ativos" value="42" detail="No período" />
      </OperationalPage>,
    );

    expect(screen.getByRole("heading", { name: "Contatos" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Ferramentas de Contatos" })).toBeVisible();
    expect(screen.getByRole("article", { name: "Leads ativos" })).toContainHTML("42");
  });
});
