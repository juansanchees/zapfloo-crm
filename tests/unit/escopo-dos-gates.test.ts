// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();

function carregarConfigFresh(env: Record<string, string>) {
  const configUrl = pathToFileURL(join(RAIZ, "playwright.fresh.config.ts")).href;
  return spawnSync(process.execPath, [
    "--import", "tsx", "--input-type=module", "--eval",
    `const m=await import(${JSON.stringify(configUrl)});const c=m.default.default??m.default;process.stdout.write(JSON.stringify({testMatch:c.testMatch,webServer:c.webServer,globalSetup:c.globalSetup,use:c.use,outputDir:c.outputDir,noCopyPrompt:process.env.PLAYWRIGHT_NO_COPY_PROMPT}))`,
  ], {
    cwd: RAIZ,
    env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", ...env },
    encoding: "utf8",
    timeout: 20_000,
  });
}

describe("escopo dos gates locais", () => {
  it("lint ignora checkouts aninhados e evidências locais, mas continua medindo fonte própria", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "gate-lint-"));
    try {
      const lint = new ESLint({ cwd: raiz, overrideConfigFile: join(RAIZ, "eslint.config.mjs") });
      expect(await lint.isPathIgnored(join(raiz, "app/page.tsx"))).toBe(false);
      expect(await lint.isPathIgnored(join(raiz, "scripts/helper.cjs"))).toBe(false);
      expect(await lint.isPathIgnored(join(raiz, ".claude/worktrees/outro/app/page.tsx"))).toBe(true);
      expect(await lint.isPathIgnored(join(raiz, ".worktrees/outro/app/page.tsx"))).toBe(true);
      expect(await lint.isPathIgnored(join(raiz, ".superpowers/evidence/sessao/helper.cjs"))).toBe(true);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("coleta só os unitários próprios, inclusive os colocados junto ao código", () => {
    const raiz = realpathSync(mkdtempSync(join(tmpdir(), "gate-coleta-")));
    const proprios = [
      "app/widget.test.tsx",
      "lib/calculo.test.ts",
      "tests/unit/proprio.test.ts",
      // Um pacote próprio pode organizar specs sob seu próprio `tests/e2e`.
      // Só a suíte Playwright da raiz pertence à exclusão do Vitest.
      "pacote/tests/e2e/proprio.spec.ts",
    ];
    const excluidos = [
      ".worktrees/outro/tests/unit/alheio.test.ts",
      ".worktrees/outro/tests/e2e/alheio.spec.ts",
      "pacote/.worktrees/outro/lib/alheio.test.ts",
      ".claude/worktrees/antigo/lib/alheio.test.ts",
      ".superpowers/evidence/sessao/alheio.test.ts",
      "pacote/node_modules/terceiro/tests/e2e/alheio.spec.ts",
      ...["e2e", "invariants", "journeys"].map((area) => `tests/${area}/externo.spec.ts`),
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

  it("config fresca recusa antes de interpretar URLs sem opt-in explícito", () => {
    const resultado = carregarConfigFresh({
      NEXT_PUBLIC_APP_URL: "https://localhost.attacker.test:3013",
      NEXT_PUBLIC_SUPABASE_URL: "https://localhost.attacker.test:57321",
    });
    expect(resultado.status).not.toBe(0);
    expect(`${resultado.stdout}${resultado.stderr}`).toContain("FRESH_E2E_OPT_IN=1");
    expect(`${resultado.stdout}${resultado.stderr}`).not.toContain("NEXT_PUBLIC_APP_URL precisa");
  });

  it("config fresca aceita somente URLs locais reais e não inicia app, seed ou artefato sensível", () => {
    const base = {
      FRESH_E2E_OPT_IN: "1",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3013",
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:57321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-ficticia",
      SUPABASE_SERVICE_ROLE_KEY: "service-ficticia",
      OWNER_EMAIL: "dono-fresco@example.test",
      OWNER_PASSWORD: "senha-ficticia",
    };
    const remoto = carregarConfigFresh({ ...base, NEXT_PUBLIC_APP_URL: "http://localhost.attacker.test:3013" });
    expect(remoto.status).not.toBe(0);
    expect(`${remoto.stdout}${remoto.stderr}`).toContain("NEXT_PUBLIC_APP_URL precisa apontar para localhost");

    const local = carregarConfigFresh(base);
    expect(local.status, local.stderr).toBe(0);
    const config = JSON.parse(local.stdout) as {
      testMatch: string;
      webServer?: unknown;
      globalSetup?: unknown;
      use: { trace: string; screenshot: string; video: string; baseURL: string };
      outputDir: string;
      noCopyPrompt?: string;
    };
    expect(config).toMatchObject({
      testMatch: "vps-fresh-onboarding.spec.ts",
      use: {
        baseURL: "http://127.0.0.1:3013",
        trace: "off",
        screenshot: "off",
        video: "off",
      },
    });
    expect(config.webServer).toBeUndefined();
    expect(config.globalSetup).toBeUndefined();
    expect(config.outputDir).toContain("zapfloo-playwright-fresh");
    expect(config.noCopyPrompt).toBe("1");
  });
});
