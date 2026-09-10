import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test("Leads abre o quadro; Funis permite trocar e gerenciar sem esconder a operação", async ({ page }) => {
  test.setTimeout(120_000);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
    throw new Error("Fixture exige banco local");
  }
  const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const org = randomUUID();
  const outroFunil = randomUUID();
  const email = `leads-${randomUUID()}@example.test`;
  const password = "SomenteFixtureLocal-2026!";
  let userId: string | undefined;
  const check = (result: { error: { message: string } | null }) => {
    if (result.error) throw new Error(result.error.message);
  };
  try {
    const user = await db.auth.admin.createUser({ email, password, email_confirm: true });
    check(user);
    userId = user.data.user!.id;
    check(await db.from("organizations").insert({ id: org, slug: org, display_name: "Empresa QA Leads", legal_name: "Empresa QA Leads", created_by: userId }));
    check(await db.from("user_organizations").insert({ user_id: userId, organization_id: org, role: "admin", accepted_at: new Date().toISOString() }));
    const seeded = await db.from("crm_pipelines").select("id").eq("organization_id", org).eq("is_default", true).single();
    check(seeded);
    const padrao = seeded.data!.id;
    check(await db.from("crm_pipelines").update({ name: "Oportunidades QA" }).eq("id", padrao).eq("organization_id", org));
    // Outro funil vem primeiro pela posição: o padrão deve vencer mesmo assim.
    check(await db.from("crm_pipelines").insert({ id: outroFunil, organization_id: org, name: "Consultas QA", slug: "consultas-qa", position: -1000 }));
    check(await db.from("crm_stages").insert({ organization_id: org, pipeline_id: outroFunil, name: "Aguardando QA", slug: "aguardando-qa", position: 1000 }));

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/login");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: /entrar/i }).click();
    await expect(page).toHaveURL(/\/onboarding/);
    await page.getByRole("button", { name: "Explorar o CRM", exact: true }).first().click();
    await expect(page).toHaveURL(/\/app/);

    const principal = page.getByRole("navigation", { name: "Navegação principal" });
    const area = page.getByRole("navigation", { name: /Leads.*Opções da área/ });
    await principal.getByRole("link", { name: "Leads", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/app/pipelines/${padrao}$`));
    await expect(page.getByRole("heading", { name: "Oportunidades QA", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Novo Lead", exact: true })).toBeEnabled();
    await expect(area.getByRole("link", { name: "Leads", exact: true })).toHaveAttribute("aria-current", "page");
    mkdirSync(".superpowers/evidence/leads-navegacao", { recursive: true });
    await page.screenshot({ path: ".superpowers/evidence/leads-navegacao/quadro-desktop.png" });

    await area.getByRole("link", { name: "Funis", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Funis", exact: true })).toBeVisible();
    await expect(page.getByTestId("novo-funil")).toBeVisible();
    await page.getByTestId(`abrir-${outroFunil}`).click();
    await expect(page).toHaveURL(new RegExp(`/app/pipelines/${outroFunil}$`));
    await expect(page.getByText("Aguardando QA", { exact: true })).toBeVisible();

    for (const width of [768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/app");
      if (width < 768) await page.getByRole("button", { name: "Abrir navegação" }).click();
      await principal.getByRole("link", { name: "Leads", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/app/pipelines/${padrao}$`));
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(area.getByRole("link", { name: "Funis", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Novo Lead", exact: true })).toBeEnabled();
      await page.screenshot({ path: `.superpowers/evidence/leads-navegacao/quadro-${width}.png` });
    }

    // Sem padrão, abre o primeiro ativo pela posição. Arquivado nunca vence.
    check(await db.from("crm_pipelines").update({ is_default: false, is_archived: true }).eq("id", padrao).eq("organization_id", org));
    await page.goto("/app/leads");
    await expect(page).toHaveURL(new RegExp(`/app/pipelines/${outroFunil}$`));
    check(await db.from("crm_pipelines").update({ is_archived: true }).eq("id", outroFunil).eq("organization_id", org));
    await page.goto("/app/leads");
    await expect(page).toHaveURL(/\/app\/kanban$/);
    await expect(page.getByRole("button", { name: "Criar meu primeiro funil", exact: true })).toBeVisible();

    // Viewer tem acesso operacional e à troca, preservando as permissões de gestão.
    check(await db.from("crm_pipelines").update({ is_archived: false }).eq("id", outroFunil).eq("organization_id", org));
    check(await db.from("user_organizations").update({ role: "viewer" }).eq("user_id", userId).eq("organization_id", org));
    await page.goto("/app/leads");
    await expect(page).toHaveURL(new RegExp(`/app/pipelines/${outroFunil}$`));
    await expect(page.getByText("Aguardando QA", { exact: true })).toBeVisible();
    await expect(area.getByRole("link", { name: "Etapas do funil" })).toHaveCount(0);
    await area.getByRole("link", { name: "Funis", exact: true }).click();
    await expect(page.getByTestId(`abrir-${outroFunil}`)).toBeVisible();
    await expect(page.getByTestId("novo-funil")).toHaveCount(0);
  } finally {
    check(await db.from("crm_stages").delete().eq("organization_id", org));
    check(await db.from("crm_pipelines").delete().eq("organization_id", org));
    check(await db.from("user_organizations").delete().eq("organization_id", org));
    check(await db.from("organizations").delete().eq("id", org));
    if (userId) check(await db.auth.admin.deleteUser(userId));
  }
});
