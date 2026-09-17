import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { badgeVariants } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

const RAIZ = process.cwd();

function fonte(nome: string) {
  return fs.readFileSync(path.join(RAIZ, "components/ui", nome), "utf8");
}

describe("casca Nocturne nos componentes base", () => {
  it("mantém os botões primários vazados e os estados do manual", () => {
    for (const variante of ["primary", "default"] as const) {
      const classes = buttonVariants({ variant: variante });
      expect(classes).toContain("bg-transparent");
      expect(classes).toContain("border-accent");
      expect(classes).toContain("text-accent");
      expect(classes).toContain(
        "hover:bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)]",
      );
      expect(classes).toContain(
        "active:bg-[color-mix(in_srgb,var(--color-accent)_22%,transparent)]",
      );
    }

    expect(buttonVariants({ variant: "secondary" })).toContain("border-border");
    expect(buttonVariants({ variant: "ghost" })).toContain("text-accent");
    expect(buttonVariants()).toContain("focus-visible:outline-2");
    expect(buttonVariants()).toContain("focus-visible:outline-accent");
    expect(buttonVariants()).toContain("focus-visible:outline-offset-2");
    expect(buttonVariants()).toContain("disabled:opacity-[.45]");
  });

  it("usa superfície, raio 8 e tipografia Nocturne nos cartões", () => {
    const card = fonte("card.tsx");
    expect(card).toContain("rounded-md bg-surface");
    expect(card).toContain("text-[17px]");
    expect(card).toContain("font-medium");
    expect(card).toContain("text-text-muted");
    expect(card).not.toContain("rounded-xl");
  });

  it("mantém campos compactos, acessíveis e pintados pelos tokens", () => {
    for (const arquivo of ["input.tsx", "textarea.tsx", "select.tsx"]) {
      const controle = fonte(arquivo);
      expect(controle).toContain("bg-surface");
      expect(controle).toContain("border-border");
      expect(controle).toContain("focus-visible:border-accent");
      expect(controle).toContain("focus-visible:outline-2");
      expect(controle).toContain("focus-visible:outline-accent");
      expect(controle).toContain("focus-visible:outline-offset-2");
      expect(controle).toContain("disabled:opacity-[.45]");
    }

    expect(fonte("input.tsx")).toContain("h-11");
    expect(fonte("input.tsx")).toContain("lg:h-9");
    expect(fonte("select.tsx")).toContain("h-11");
    expect(fonte("select.tsx")).toContain("lg:h-9");
  });

  it("pinta a etiqueta padrão com a rampa, sem apagar estados semânticos", () => {
    const padrao = badgeVariants({ variant: "default" });
    expect(padrao).toContain("bg-accent-800");
    expect(padrao).toContain("text-accent-100");
    expect(badgeVariants({ variant: "success" })).toContain("bg-success-bg");
    expect(badgeVariants({ variant: "warning" })).toContain("bg-warning-bg");
    expect(badgeVariants({ variant: "error" })).toContain("bg-error-bg");
  });

  it("desbota réguas e linhas de tabela nos 48px das pontas", () => {
    expect(fonte("separator.tsx")).toContain("linear-gradient(to_right");
    expect(fonte("separator.tsx")).toContain("48px");
    expect(fonte("table.tsx")).toContain("linear-gradient(to_right");
    expect(fonte("table.tsx")).toContain("48px");
  });

  it("usa o barril Phosphor nos primitivos tocados", () => {
    for (const arquivo of ["dialog.tsx", "dropdown-menu.tsx", "select.tsx", "sheet.tsx"]) {
      const componente = fonte(arquivo);
      expect(componente).not.toContain('from "lucide-react"');
      expect(componente).toContain('from "@/lib/ui/icons"');
    }
  });
});
