import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test("clicar no gatilho permite escolher e persistir o disparo sem sair do nó", async ({ page }) => {
  test.setTimeout(90_000);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Fixture exige banco local");
  const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const org = randomUUID(), flow = randomUUID();
  const email = `trigger-${randomUUID()}@example.test`, password = "SomenteFixtureLocal-2026!";
  let userId: string | undefined;
  const check = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); };
  try {
    const user = await db.auth.admin.createUser({ email, password, email_confirm: true });
    check(user); userId = user.data.user!.id;
    check(await db.from("organizations").insert({ id: org, slug: org, display_name: "Empresa QA", legal_name: "Empresa QA", created_by: userId }));
    check(await db.from("user_organizations").insert({ user_id: userId, organization_id: org, role: "admin", accepted_at: new Date().toISOString() }));
    check(await db.from("followup_flow_pointers").insert({ id: flow, organization_id: org, name: "Fluxo QA", draft_graph: {
      nodes: [{ id: "start", type: "trigger", label: "Início do fluxo", config: {}, position: { x: 0, y: 0 } }], edges: [],
    } }));
    await page.goto("/login");
    await page.locator("#email").fill(email); await page.locator("#password").fill(password);
    await page.getByRole("button", { name: /entrar/i }).click();
    await expect(page).toHaveURL(/\/onboarding/);
    await page.getByRole("button", { name: "Explorar o CRM", exact: true }).first().click();
    await expect(page).toHaveURL(/\/app/);
    await page.goto(`/app/ai/followups/${flow}`);
    await page.locator(".react-flow__node-trigger").click();
    const panel = page.getByTestId("node-config-panel");
    await expect(panel.getByLabel("Tipo de gatilho")).toBeVisible();
    await panel.getByLabel("Tipo de gatilho").click();
    await expect(page.getByRole("option", { name: "Etapa do funil", exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: "Fim de conversa", exact: true })).toHaveCount(0);
    await page.getByRole("option", { name: "Silêncio", exact: true }).click();
    await panel.getByLabel("Minutos de silêncio").fill("15");
    await page.getByTestId("trigger-config-button").click();
    const toolbarForm = page.getByTestId("trigger-config-panel");
    await expect(toolbarForm.getByLabel("Minutos de silêncio")).toHaveValue("15");
    await toolbarForm.getByLabel("Minutos de silêncio").fill("25");
    await expect(panel.getByLabel("Minutos de silêncio")).toHaveValue("25");
    await page.keyboard.press("Escape");
    await panel.getByLabel("Minutos de silêncio").fill("15");
    // Fechar e voltar não pode apagar o que ainda não foi salvo.
    await page.locator(".react-flow__pane").click({ position: { x: 8, y: 8 } });
    await expect(panel).toHaveCount(0);
    await page.locator(".react-flow__node-trigger").click();
    await expect(panel.getByLabel("Minutos de silêncio")).toHaveValue("15");
    await panel.getByRole("button", { name: "Salvar gatilho", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Salvar gatilho", exact: true })).toBeDisabled();
    const saved = await db.from("followup_flow_pointers").select("trigger_config,status").eq("id", flow).single();
    check(saved);
    expect(saved.data).toMatchObject({ status: "draft", trigger_config: { kind: "silence", params: { threshold_minutes: 15 } } });
    await page.reload();
    await page.locator(".react-flow__node-trigger").click();
    await expect(panel.getByLabel("Minutos de silêncio")).toHaveValue("15");
    mkdirSync(".superpowers/evidence/fluxo-gatilho", { recursive: true });
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      // Clique real prova alcance após rolagem, não só existência fora do recorte.
      await panel.getByLabel("Minutos de silêncio").fill(String(width));
      await panel.getByRole("button", { name: "Salvar gatilho", exact: true }).click();
      await expect(panel.getByRole("button", { name: "Salvar gatilho", exact: true })).toBeDisabled();
      const persisted = await db.from("followup_flow_pointers").select("trigger_config").eq("id", flow).single();
      check(persisted);
      expect(persisted.data?.trigger_config.params.threshold_minutes).toBe(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await panel.screenshot({ path: `.superpowers/evidence/fluxo-gatilho/editor-${width}.png` });
      await page.screenshot({ path: `.superpowers/evidence/fluxo-gatilho/tela-${width}.png` });
    }
  } finally {
    check(await db.from("followup_flow_pointers").delete().eq("id", flow).eq("organization_id", org));
    check(await db.from("user_organizations").delete().eq("organization_id", org));
    check(await db.from("organizations").delete().eq("id", org));
    if (userId) check(await db.auth.admin.deleteUser(userId));
  }
});
