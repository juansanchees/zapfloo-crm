import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { PISOS, derivarMarca, extrairRegua, razaoDeContraste } from "@/lib/branding/contraste";
import { GRAUS, type Rampa } from "@/lib/branding/rampa";

const RAIZ = process.cwd();
const CSS = fs.readFileSync(path.join(RAIZ, "app/globals.css"), "utf8");
const REGUA = extrairRegua(CSS);
const FONTES = ["components/shell/Sidebar.tsx", "components/shell/MobileSidebar.tsx"] as const;

function corDaShellClara(): string {
  const bloco = CSS.match(/\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/)?.[1];
  const cor = bloco?.match(/--color-shell:\s*(#[0-9a-f]{6})/i)?.[1];
  if (!cor) throw new Error("--color-shell do tema claro não encontrado");
  return cor;
}

function grauDoAccentLocal(fonte: string): number {
  const match = fonte.match(/\[--color-accent:var\(--color-accent-(\d+)\)\]/);
  if (!match?.[1]) throw new Error("a shell deixou de declarar o papel local do accent");
  return Number(match[1]);
}

function corDoPapel(fonte: string, rampa: Rampa): string {
  const grau = grauDoAccentLocal(fonte);
  const indice = GRAUS.findIndex((candidato) => candidato === grau);
  if (indice < 0) throw new Error(`grau ${grau} não pertence à rampa white-label`);
  const cor = rampa[indice];
  if (!cor) throw new Error(`rampa white-label sem o grau ${grau}`);
  return cor;
}

describe("contraste white-label da shell escura no tema claro", () => {
  it.each(FONTES)("%s usa o stop claro da rampa, sem cor fixa", (arquivo) => {
    const fonte = fs.readFileSync(path.join(RAIZ, arquivo), "utf8");
    expect(grauDoAccentLocal(fonte)).toBe(300);
  });

  it.each([
    ["marca do produto", REGUA.rampaDoProduto],
    ["marca escura", derivarMarca(REGUA.rampaDoProduto[10], REGUA).rampa],
  ] as const)("mantém texto de destaque legível com %s", (_nome, rampa) => {
    const fundo = corDaShellClara();

    for (const arquivo of FONTES) {
      const fonte = fs.readFileSync(path.join(RAIZ, arquivo), "utf8");
      expect(razaoDeContraste(corDoPapel(fonte, rampa), fundo)).toBeGreaterThanOrEqual(PISOS.texto);
    }
  });

  it("prova que herdar o accent claro antigo reprovaria o mesmo piso", () => {
    const fundo = corDaShellClara();
    const marcaEscura = derivarMarca(REGUA.rampaDoProduto[10], REGUA);

    expect(razaoDeContraste(marcaEscura.claro.accent, fundo)).toBeLessThan(PISOS.texto);
  });
});
