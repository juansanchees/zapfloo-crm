/**
 * G2-04 — E2E da matriz role×recurso (spec 13 §4) com usuários seed reais.
 *
 * Papéis do tenant não alcançam credenciais nem tokens; o dono da instalação
 * alcança as duas superfícies. Billing continua sendo decisão do admin do tenant.
 *
 * Pré-requisito: `npx tsx scripts/seed-e2e-credentials.ts` (o spec roda o seed
 * sozinho se .e2e-creds.json estiver ausente/incompleto).
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";

import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";
import { afirmarAdminDeTenantPuro } from "./utils/precondicao";
import { generateTotp, msUntilNextTotpWindow } from "./utils/totp";

interface E2ECreds {
  org_id: string;
  default_agent_id: string;
  password: string;
  users: Record<string, { id: string; email: string; role: string }>;
  admin_totp?: { factor_id: string; secret: string };
  dono_totp?: { factor_id: string; secret: string };
}

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");

function loadCreds(): E2ECreds {
  const needsSeed = (): boolean => {
    if (!fs.existsSync(CREDS_PATH)) return true;
    const c = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as E2ECreds;
    return !c.users?.viewer || !c.users?.dono || !c.admin_totp?.secret || !c.dono_totp?.secret;
  };
  if (needsSeed()) {
    execFileSync("npx", ["tsx", "scripts/seed-e2e-credentials.ts"], { stdio: "inherit" });
  }
  return JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as E2ECreds;
}

const creds = loadCreds();

// ── Precondição de identidade ────────────────────────────────────────────────
// Esta spec é a matriz de PAPEL do tenant, e é onde um escape de plataforma
// faria mais estrago: uma regressão de RBAC ficaria invisível na spec que existe
// para pegá-la.
//
// ⚠️ MEDIDO antes de afirmar: as duas telas do caso do admin
// (`app/app/settings/api-tokens/page.tsx:12` e `.../billing/page.tsx:20`)
// gateiam em `ROLE_RANK[activeOrg.role] < ROLE_RANK.admin` **sem** escape de
// `is_platform_admin`, e `requireRole` só bypassa com `allowPlatformAdmin: true`
// explícito. Hoje a promoção NÃO muda o desfecho deste arquivo. A precondição
// fica porque é aqui que a próxima asserção de papel vai nascer.
test.beforeAll(async () => {
  // Torna somente o usuário dedicado `dono` administrador da instalação e
  // reafirma que o `admin` compartilhado continua sendo admin de tenant puro.
  execFileSync("npx", ["tsx", "scripts/seed-e2e-system-update.ts"], { stdio: "inherit" });
  await afirmarAdminDeTenantPuro(creds.users.admin!.email);
});

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/app\//);
}

async function loginWithTotp(page: Page, email: string, secret: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/login\/mfa/);

  // Até 2 tentativas: um código pode expirar na borda da janela de 30s.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (msUntilNextTotpWindow() < 3_000) {
      await page.waitForTimeout(msUntilNextTotpWindow() + 200);
    }
    const code = generateTotp(secret);
    const firstDigit = page.locator('input[aria-label="Dígito 1"]');
    await firstDigit.click();
    await page.keyboard.type(code, { delay: 40 });
    try {
      await page.waitForURL(/\/app\//, { timeout: 8_000 });
      return;
    } catch {
      // código rejeitado — espera a próxima janela e tenta de novo
      await page.waitForTimeout(msUntilNextTotpWindow() + 200);
    }
  }
  throw new Error("MFA challenge failed after 2 TOTP attempts");
}

async function expectNoBlockingA11y(page: Page, excludeSelector?: string): Promise<void> {
  let builder = new AxeBuilder({ page });
  if (excludeSelector) builder = builder.exclude(excludeSelector);
  const results = await builder.analyze();
  const blocking = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

async function loginComoPapelDoTenant(
  page: Page,
  role: "viewer" | "agent" | "manager" | "admin",
): Promise<void> {
  const usuario = creds.users[role]!;
  if (role === "admin") {
    expect(creds.admin_totp?.secret, "seed deve gravar admin_totp em .e2e-creds.json").toBeTruthy();
    await loginWithTotp(page, usuario.email, creds.admin_totp!.secret);
    return;
  }
  await login(page, usuario.email);
}

test.describe("rbac role matrix (spec 13 §4)", () => {
  for (const role of ["viewer", "agent", "manager", "admin"] as const) {
    test(`${role} do tenant não atravessa as superfícies técnicas`, async ({ page }) => {
      await page.context().clearCookies();
      await loginComoPapelDoTenant(page, role);

      await page.goto("/app/ai");
      await expect(page.locator('a[href="/app/ai/credentials"]'), role).toHaveCount(0);
      await page.goto("/app/settings");
      await expect(page.locator('a[href="/app/settings/api-tokens"]'), role).toHaveCount(0);

      await page.goto("/app/ai/credentials");
      await page.waitForURL(/\/403/);
      await expect(page.getByRole("heading", { name: /403 — Sem permissão/ }), role).toBeVisible();

      await page.goto("/app/settings/api-tokens");
      await page.waitForURL(/\/403/);
      await expect(page.getByRole("heading", { name: /403 — Sem permissão/ }), role).toBeVisible();

      expect((await page.request.get("/api/v1/ai/credentials")).status(), role).toBe(403);
      expect((await page.request.get("/api/v1/settings/api-tokens")).status(), role).toBe(403);
    });
  }

  test("agent continua bloqueado em billing (403)", async ({ page }) => {
    await login(page, creds.users.agent!.email);

    await page.goto("/app/settings/billing");
    await page.waitForURL(/\/403/);
    await expect(page.getByRole("heading", { name: /403 — Sem permissão/ })).toBeVisible();

    await expectNoBlockingA11y(page);
  });

  test("admin do tenant não acessa superfícies técnicas, mas continua acessando billing", async ({ page }) => {
    expect(creds.admin_totp?.secret, "seed deve gravar admin_totp em .e2e-creds.json").toBeTruthy();
    await loginWithTotp(page, creds.users.admin!.email, creds.admin_totp!.secret);

    await page.goto("/app/settings/billing");
    await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
    await expectNoBlockingA11y(page);
  });

  test("dono da instalação acessa credenciais e tokens pela tela e pela API", async ({ page }) => {
    expect(creds.dono_totp?.secret, "seed deve gravar dono_totp em .e2e-creds.json").toBeTruthy();
    await loginWithTotp(page, creds.users.dono!.email, creds.dono_totp!.secret);

    await page.goto("/app/ai");
    await expect(page.locator('a[href="/app/ai/credentials"]')).toBeVisible();
    await page.goto("/app/ai/credentials");
    await expect(page.getByRole("heading", { name: /chaves de acesso à ia/i })).toBeVisible();
    expect((await page.request.get("/api/v1/ai/credentials")).status()).toBe(200);

    await page.goto("/app/settings");
    await expect(page.locator('a[href="/app/settings/api-tokens"]')).toBeVisible();
    await page.goto("/app/settings/api-tokens");
    await expect(page.getByRole("heading", { name: "API Tokens" })).toBeVisible();
    expect((await page.request.get("/api/v1/settings/api-tokens")).status()).toBe(200);
  });

  test("distribuição some com um agente, aparece com dois e a URL direta funciona nos dois estados", async ({ page }) => {
    const ambiente = credenciaisSupabaseDeTeste();
    const db = createClient(ambiente.url, ambiente.serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: retrato, error: erroRetrato } = await db
      .from("ai_agents")
      .select("id, is_active, archived_at")
      .eq("organization_id", creds.org_id);
    expect(erroRetrato).toBeNull();

    let temporario: string | null = null;
    try {
      await db
        .from("ai_agents")
        .update({ is_active: false } as never)
        .eq("organization_id", creds.org_id);
      const { error: erroPrimeiro } = await db
        .from("ai_agents")
        .update({ is_active: true, archived_at: null } as never)
        .eq("id", creds.default_agent_id)
        .eq("organization_id", creds.org_id);
      expect(erroPrimeiro).toBeNull();

      await login(page, creds.users.manager!.email);
      await page.goto("/app/ai");
      await expect(page.locator('a[href="/app/ai/routers"]')).toHaveCount(0);
      await page.goto("/app/ai/routers");
      await expect(page.getByRole("heading", { name: "Roteadores" })).toBeVisible();

      const { data: segundo, error: erroSegundo } = await db
        .from("ai_agents")
        .insert({
          organization_id: creds.org_id,
          name: "Agente temporário da prova de navegação",
          description: "Removido no finally da spec",
          is_active: true,
          is_default: false,
          model: "anthropic/claude-sonnet-4-6",
          system_prompt: "Agente temporário de teste.",
          config: {},
          guardrails: [],
        } as never)
        .select("id")
        .single();
      expect(erroSegundo).toBeNull();
      temporario = (segundo as { id: string }).id;

      await page.goto("/app/ai");
      const atalhosDeDistribuicao = page.locator('a[href="/app/ai/routers"]');
      await expect(atalhosDeDistribuicao).toHaveCount(2);
      await expect(atalhosDeDistribuicao.first()).toBeVisible();
      await expect(atalhosDeDistribuicao.last()).toBeVisible();
      await page.goto("/app/ai/routers");
      await expect(page.getByRole("heading", { name: "Roteadores" })).toBeVisible();
    } finally {
      if (temporario) await db.from("ai_agents").delete().eq("id", temporario);
      for (const agente of retrato ?? []) {
        await db
          .from("ai_agents")
          .update({ is_active: agente.is_active, archived_at: agente.archived_at } as never)
          .eq("id", agente.id)
          .eq("organization_id", creds.org_id);
      }
    }
  });

  test("agent vê inbox e kanban", async ({ page }) => {
    await login(page, creds.users.agent!.email);

    await page.goto("/app/inbox");
    await expect(page.getByText("Selecione uma conversa", { exact: true })).toBeVisible();
    // Baseline pré-G2-04: as abas Radix de InboxFilters apontam aria-controls
    // para painel não renderizado (aria-valid-attr-value, defeito pré-existente
    // fora do escopo desta feature). Excluímos só o tablist; o resto da tela
    // segue coberto por todas as regras — sem regressão é o critério.
    await expectNoBlockingA11y(page, '[role="tablist"]');

    await page.goto("/app/kanban");
    await expect(page.getByRole("heading", { name: "Funis" })).toBeVisible();
    await expectNoBlockingA11y(page);
  });

  test("viewer não consegue enviar mensagem (403 no POST /api/v1/messages)", async ({ page }) => {
    await login(page, creds.users.viewer!.email);

    // Enforcement server-side (G2-01): requireRole("agent") roda antes de
    // qualquer validação de recurso — viewer recebe 403 forbidden_role.
    const res = await page.request.post("/api/v1/messages", {
      data: {
        conversation_id: "00000000-0000-4000-8000-000000000000",
        body: "mensagem de teste e2e",
        type: "text",
      },
    });
    expect(res.status()).toBe(403);
    const json = (await res.json()) as { error?: { code?: string } };
    expect(json.error?.code).toBe("forbidden_role");
  });
});
