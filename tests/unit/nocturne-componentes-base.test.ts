import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { badgeVariants } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { razaoDeContraste } from "@/lib/branding/contraste";
import { compor } from "@/lib/branding/rampa";

const RAIZ = process.cwd();

function fonte(nome: string) {
  return fs.readFileSync(path.join(RAIZ, "components/ui", nome), "utf8");
}

function fontesDosPrimitivos() {
  return fs
    .readdirSync(path.join(RAIZ, "components/ui"))
    .filter((nome) => nome.endsWith(".tsx"))
    .map((nome) => ({ nome, conteudo: fonte(nome) }));
}

function tokensDoTema(seletor: ":root" | '[data-theme="dark"]') {
  const css = fs.readFileSync(path.join(RAIZ, "app/globals.css"), "utf8");
  const seletorEscapado = seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bloco = css.match(new RegExp(`${seletorEscapado}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1];
  if (!bloco) throw new Error(`tema ${seletor} ausente`);

  const token = (nome: string) => {
    const nomeEscapado = nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const valor = bloco.match(new RegExp(`${nomeEscapado}:\\s*([^;]+);`))?.[1]?.trim();
    if (!valor) throw new Error(`${nome} ausente em ${seletor}`);
    return valor;
  };

  return { token };
}

describe("casca Nocturne nos componentes base", () => {
  it("mantém as quatro animações dentro da preferência explícita de movimento", () => {
    const css = fs.readFileSync(path.join(RAIZ, "app/globals.css"), "utf8");
    const cabecalho = "@media (prefers-reduced-motion: no-preference)";
    const inicio = css.indexOf(cabecalho);
    expect(inicio, "não achei o media query que autoriza movimento").toBeGreaterThanOrEqual(0);

    const abre = css.indexOf("{", inicio);
    let profundidade = 0;
    let fecha = -1;
    for (let i = abre; i < css.length; i += 1) {
      if (css[i] === "{") profundidade += 1;
      if (css[i] === "}") profundidade -= 1;
      if (profundidade === 0) {
        fecha = i;
        break;
      }
    }
    expect(fecha, "media query de movimento não fecha").toBeGreaterThan(abre);

    const bloco = css.slice(abre + 1, fecha).replace(/\s+/g, " ");
    expect(bloco).toContain(
      "@keyframes zfIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }",
    );
    expect(bloco).toContain(
      "@keyframes zfToast { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }",
    );
    expect(bloco).toContain(
      "@keyframes zfPulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }",
    );
    expect(bloco).toContain(
      "@keyframes zfSweep { from { transform: translateX(-100%); } to { transform: translateX(300%); } }",
    );

    const fora = `${css.slice(0, inicio)}${css.slice(fecha + 1)}`;
    for (const nome of ["zfIn", "zfToast", "zfPulse", "zfSweep"]) {
      expect(fora, `${nome} escapou da preferência de movimento`).not.toContain(
        `@keyframes ${nome}`,
      );
    }
  });

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
    expect(buttonVariants()).toContain("rounded-md");

    const destrutivo = buttonVariants({ variant: "destructive" });
    expect(destrutivo).toContain("border-error");
    expect(destrutivo).toContain("bg-transparent");
    expect(destrutivo).toContain("text-error-fg");
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

    expect(fonte("input.tsx")).toContain("h-9");
    expect(fonte("input.tsx")).not.toContain("h-11");
    expect(fonte("select.tsx")).toContain("h-9");
    expect(fonte("select.tsx")).not.toContain("h-11");
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
    expect(fonte("table.tsx")).toContain("hover:bg-[linear-gradient(color-mix");
    expect(fonte("table.tsx")).toContain(",linear-gradient(to_right,transparent");
  });

  it("usa o barril Phosphor nos primitivos tocados", () => {
    for (const arquivo of ["dialog.tsx", "dropdown-menu.tsx", "select.tsx", "sheet.tsx"]) {
      const componente = fonte(arquivo);
      expect(componente).not.toContain('from "lucide-react"');
      expect(componente).toContain('from "@/lib/ui/icons"');
    }
  });

  it("não reintroduz preto, branco, foco azul nem disabled acima de 45%", () => {
    for (const { nome, conteudo } of fontesDosPrimitivos()) {
      expect(conteudo, nome).not.toMatch(/\b(?:bg|text)-(?:black|white)(?:\/\d+)?\b/);
      expect(conteudo, nome).not.toContain("outline-hidden");
      expect(conteudo, nome).not.toMatch(/focus(?:-visible)?:[^\s"']*ring/);

      const opacidadesDesabilitadas = conteudo.match(
        /(?:peer-|data-\[disabled\]:|disabled:)opacity-[^\s"']+/g,
      );
      for (const opacidade of opacidadesDesabilitadas ?? []) {
        expect(opacidade, nome).toMatch(/opacity-\[\.45\]$/);
      }
    }
  });

  it("dá a todo primitivo antes preso ao ring legado o outline Nocturne", () => {
    for (const arquivo of [
      "dialog.tsx",
      "dropdown-menu.tsx",
      "popover.tsx",
      "select.tsx",
      "sheet.tsx",
      "switch.tsx",
      "tabs.tsx",
    ]) {
      const componente = fonte(arquivo);
      expect(componente, arquivo).toContain("focus-visible:outline-2");
      expect(componente, arquivo).toContain("focus-visible:outline-accent");
      expect(componente, arquivo).toContain("focus-visible:outline-offset-2");
    }
  });

  it("usa o accent resolvido no foco global e peso 500 nos títulos", () => {
    const css = fs.readFileSync(path.join(RAIZ, "app/globals.css"), "utf8");
    const foco = css.match(/:focus-visible\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? "";
    expect(foco).toContain("outline: 2px solid var(--color-accent)");
    expect(foco).not.toContain("accent-400");
    expect(foco).not.toContain("accent-600");

    for (const arquivo of ["alert-dialog.tsx", "dialog.tsx", "sheet.tsx"]) {
      const componente = fonte(arquivo);
      expect(componente, arquivo).toMatch(/Title[\s\S]*?font-medium/);
      expect(componente, arquivo).not.toMatch(/Title[\s\S]*?font-semibold/);
    }

    const pagina = fonte("operational-page.tsx");
    expect(pagina).toContain('h1 className="text-2xl font-medium');
    expect(pagina).not.toContain('h1 className="text-2xl font-semibold');
  });

  it("mantém o destrutivo legível no repouso e no hover dos dois temas", () => {
    for (const seletor of [":root", '[data-theme="dark"]'] as const) {
      const { token } = tokensDoTema(seletor);
      const frente = token("--color-error-fg");
      const fundo = token("--color-bg");
      const erro = token("--color-error");
      const alfa = Number(token("--color-error-bg").match(/,\s*([\d.]+)\)$/)?.[1]);
      const hover = compor(erro, alfa, fundo);

      expect(razaoDeContraste(frente, fundo), seletor).toBeGreaterThanOrEqual(4.5);
      expect(razaoDeContraste(frente, hover), seletor).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("mantém overlays no token e superfícies de cartão no raio 8", () => {
    for (const arquivo of ["alert-dialog.tsx", "dialog.tsx", "sheet.tsx"]) {
      expect(fonte(arquivo)).toContain("bg-overlay");
    }

    for (const { nome, conteudo } of fontesDosPrimitivos()) {
      expect(conteudo, nome).not.toContain("rounded-xl");
    }
  });
});
