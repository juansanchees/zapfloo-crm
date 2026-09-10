/**
 * Fronteira determinística da jornada sem IA no CI.
 *
 * A falha de sessão é controlada pelo Playwright: isto prova a reação da tela,
 * não WAHA nem pareamento. A fixture possui usuário/organização próprios e só
 * remove esses recursos ao terminar.
 */
import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SENHA = "OnboardingSemIa-2026!";
const CHAVES_OPCIONAIS = [
  "RESEND_API_KEY",
  "AI_GATEWAY_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
] as const;

test("sessão recusada permite adiar IA e explorar sem fingir conclusão", async ({
  browser,
  page,
}, testInfo) => {
  for (const chave of CHAVES_OPCIONAIS) {
    const ausente = process.env[chave] === undefined;
    expect(ausente, `${chave} precisa estar ausente no runner do CI`).toBe(true);
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["127.0.0.1", "localhost"].includes(new URL(supabaseUrl).hostname)) {
    throw new Error("Esta fixture só pode usar o Supabase local.");
  }
  const svc = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const organizationId = randomUUID();
  const email = `onboarding-sem-ia-${randomUUID()}@example.test`;
  let userId = "";

  try {
    const criado = await svc.auth.admin.createUser({ email, password: SENHA, email_confirm: true });
    if (criado.error || !criado.data.user) throw criado.error ?? new Error("Fixture de usuário falhou.");
    userId = criado.data.user.id;
    const org = await svc.from("organizations").insert({
      id: organizationId,
      slug: `onboarding-sem-ia-${organizationId}`,
      legal_name: "Onboarding sem IA QA",
      display_name: "Minha Empresa",
      created_by: userId,
      settings: { llm: { provider: "anthropic" } },
    });
    if (org.error) throw org.error;
    const membership = await svc.from("user_organizations").insert({
      organization_id: organizationId,
      user_id: userId,
      role: "admin",
      accepted_at: new Date().toISOString(),
    });
    if (membership.error) throw membership.error;

    const metodosDaSessao = new Set<string>();
    await page.route("**/api/v1/onboarding/whatsapp/session**", async (route) => {
      metodosDaSessao.add(route.request().method());
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "upstream_unavailable", message: "fronteira de sessão recusada pelo teste" } }),
      });
    });

    await page.goto("/login");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(SENHA);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/onboarding\/welcome/);
    // Sem `?provar=1`: confirma apenas o provedor selecionado, a origem da
    // chave dele e o e-mail no ambiente do processo Next.
    const instalacao = await page.request.get("/api/v1/system/instalacao");
    expect(instalacao.status()).toBe(200);
    const retrato = (await instalacao.json()) as {
      data: { inteligencia: { provedor: string; origemDaChave: string }; email: { configurado: boolean } };
    };
    expect(retrato.data.inteligencia).toMatchObject({ provedor: "anthropic", origemDaChave: "nenhuma" });
    expect(retrato.data.email.configurado).toBe(false);
    await page.locator("#display_name").fill("Empresa sem IA QA");
    await page.locator("#segmento").selectOption("servicos");
    await page.locator("#o_que_faz").fill("Atendimento humano de teste");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(page).toHaveURL(/\/onboarding\/connect-whatsapp/);

    await page.getByTestId("forma-qr").locator("input").click();
    await expect(page.getByText("O serviço de WhatsApp desta instalação não respondeu.", { exact: false })).toBeVisible();
    await expect(page.getByText("fronteira de sessão recusada pelo teste", { exact: false })).toBeVisible();
    await expect(page.locator('img[src*="/onboarding/whatsapp/qr"]')).toHaveCount(0);
    await expect.poll(() => [...metodosDaSessao].sort(), { timeout: 10_000 }).toEqual(["GET", "POST"]);

    await page.getByRole("link", { name: "Configurar IA (opcional)", exact: true }).click();
    await expect(page).toHaveURL(/\/onboarding\/setup-ai/);
    await page.getByRole("button", { name: "Adiar IA e continuar", exact: true }).click();
    await expect(page).toHaveURL(/\/onboarding\/connect-whatsapp/);

    const estado = await svc.from("organizations").select("onboarded_at,onboarding_state").eq("id", organizationId).single();
    if (estado.error) throw estado.error;
    expect(estado.data.onboarded_at).toBeNull();
    expect(estado.data.onboarding_state).toMatchObject({ ai: { skipped: true } });
    expect((estado.data.onboarding_state as { whatsapp?: unknown }).whatsapp).toBeUndefined();
    for (const tabela of ["ai_agents", "ai_agent_versions", "ai_provider_credentials", "channel_sessions"] as const) {
      const resultado = await svc.from(tabela).select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
      if (resultado.error) throw resultado.error;
      expect(resultado.count, `${tabela} deve continuar vazia`).toBe(0);
    }
    const auditoria = await svc.from("api_audit_log").select("action").eq("organization_id", organizationId).eq("action", "onboarding.ai_skipped");
    if (auditoria.error) throw auditoria.error;
    expect(auditoria.data).toEqual([{ action: "onboarding.ai_skipped" }]);

    const explorar = page.getByRole("button", { name: "Explorar o CRM", exact: true });
    await expect(explorar).toHaveCount(1);
    await explorar.click();
    await expect(page).toHaveURL(/\/app\/inbox/);
    await expect(page.getByRole("link", { name: "Retomar configuração", exact: true })).toBeVisible();

    // Outro navegador não herda o cookie de exploração de 30 dias. A sessão
    // autenticada volta ao primeiro passo realmente pendente: o WhatsApp.
    const baseURL = String(testInfo.project.use.baseURL);
    const reentrada = await browser.newContext({ baseURL });
    try {
      expect(
        (await reentrada.cookies()).every((cookie) => cookie.name !== "onboarding_explore"),
        "o novo contexto não pode herdar o cookie de exploração",
      ).toBe(true);
      const novaPagina = await reentrada.newPage();
      await novaPagina.goto("/login");
      await novaPagina.locator("#email").fill(email);
      await novaPagina.locator("#password").fill(SENHA);
      await novaPagina.getByRole("button", { name: "Entrar", exact: true }).click();
      await expect(novaPagina).toHaveURL(/\/onboarding\/connect-whatsapp/);
      expect(
        (await reentrada.cookies()).every((cookie) => cookie.name !== "onboarding_explore"),
        "a reentrada pendente não pode criar cookie de exploração",
      ).toBe(true);
    } finally {
      await reentrada.close();
    }
  } finally {
    await svc.from("organizations").delete().eq("id", organizationId);
    if (userId) await svc.auth.admin.deleteUser(userId);
  }
});
