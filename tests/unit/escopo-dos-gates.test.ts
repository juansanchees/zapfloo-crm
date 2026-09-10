// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();

describe("escopo dos gates locais", () => {
  it("lint ignora checkouts aninhados, mas continua medindo fonte própria", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "gate-lint-"));
    try {
      const lint = new ESLint({ cwd: raiz, overrideConfigFile: join(RAIZ, "eslint.config.mjs") });
      expect(await lint.isPathIgnored(join(raiz, "app/page.tsx"))).toBe(false);
      expect(await lint.isPathIgnored(join(raiz, ".claude/worktrees/outro/app/page.tsx"))).toBe(true);
      expect(await lint.isPathIgnored(join(raiz, ".worktrees/outro/app/page.tsx"))).toBe(true);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("coleta só os unitários próprios, inclusive os colocados junto ao código", () => {
    const raiz = realpathSync(mkdtempSync(join(tmpdir(), "gate-coleta-")));
    const proprios = ["app/widget.test.tsx", "lib/calculo.test.ts", "tests/unit/proprio.test.ts"];
    const excluidos = [
      ".worktrees/outro/tests/unit/alheio.test.ts",
      ".worktrees/outro/tests/e2e/alheio.spec.ts",
      "pacote/.worktrees/outro/lib/alheio.test.ts",
      ".claude/worktrees/antigo/lib/alheio.test.ts",
      ...["e2e", "invariants", "journeys"].flatMap((area) => [
        `tests/${area}/externo.spec.ts`, `pacote/tests/${area}/externo.spec.ts`,
      ]),
    ];
    try {
      for (const arquivo of [...proprios, ...excluidos]) {
        const destino = join(raiz, arquivo);
        mkdirSync(dirname(destino), { recursive: true });
        // Nem os próprios podem executar: esta sonda mede descoberta, não seeds.
        writeFileSync(destino, 'throw new Error("A coleta não pode executar o arquivo");\n');
      }
      const saida = execFileSync(process.execPath, [
        resolve(RAIZ, "node_modules/vitest/vitest.mjs"), "list", "--filesOnly", "--json",
        "--root", raiz, "--config", join(RAIZ, "vitest.config.ts"),
      ], { cwd: RAIZ, encoding: "utf8", timeout: 20_000, stdio: ["ignore", "pipe", "pipe"] });
      const encontrados = JSON.parse(saida) as Array<{ file: string }>;
      expect(encontrados.map((item) => item.file).sort()).toEqual(proprios.map((p) => join(raiz, p)).sort());
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});
