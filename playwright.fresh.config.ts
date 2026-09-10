import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineConfig } from "@playwright/test";

function obrigatoria(nome: string): string {
  const valor = process.env[nome]?.trim();
  if (!valor) throw new Error(`Prova fresca recusada: defina ${nome} explicitamente.`);
  return valor;
}

function urlLocal(nome: string): string {
  const bruto = obrigatoria(nome);
  let url: URL;
  try {
    url = new URL(bruto);
  } catch {
    throw new Error(`Prova fresca recusada: ${nome} não é uma URL válida.`);
  }
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error(`Prova fresca recusada: ${nome} precisa apontar para localhost.`);
  }
  if (url.protocol !== "http:") {
    throw new Error(`Prova fresca recusada: ${nome} precisa usar HTTP local.`);
  }
  return url.origin;
}

if (process.env.FRESH_E2E_OPT_IN !== "1") {
  // Esta é deliberadamente a primeira validação: sem consentimento explícito,
  // nem URL é interpretada e nenhuma preparação/rede pode começar por engano.
  throw new Error("Prova fresca recusada: defina FRESH_E2E_OPT_IN=1.");
}

// Playwright 1.62.1 ignora a captura `page.ariaSnapshot()` quando este guard
// está ativo. `error-context.md` ainda pode existir com erro/source, mas sem o
// snapshot DOM que poderia conter QR, secret TOTP, recovery ou link de convite.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

const appUrl = urlLocal("NEXT_PUBLIC_APP_URL");
urlLocal("NEXT_PUBLIC_SUPABASE_URL");
obrigatoria("NEXT_PUBLIC_SUPABASE_ANON_KEY");
obrigatoria("SUPABASE_SERVICE_ROLE_KEY");
const ownerEmail = obrigatoria("OWNER_EMAIL");
obrigatoria("OWNER_PASSWORD");
if (!ownerEmail.toLowerCase().endsWith(".test")) {
  throw new Error("Prova fresca recusada: OWNER_EMAIL precisa ser um dono fictício em .test.");
}

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "vps-fresh-onboarding.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // O scan manual pode consumir até 10 minutos; a jornada posterior (convite,
  // MFA opcional e reentrada) precisa de margem própria dentro do mesmo teste.
  timeout: 16 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  outputDir: join(tmpdir(), "zapfloo-playwright-fresh"),
  use: {
    baseURL: appUrl,
    browserName: "chromium",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  // O app e o bootstrap são preparados externamente pelo operador. Ausência
  // intencional: sem webServer, globalSetup, storageState, seed ou reset.
});
