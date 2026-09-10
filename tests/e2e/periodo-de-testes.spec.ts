import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test("prazo persistente no onboarding e CRM, com composer dentro da tela", async ({ page }) => {
  test.setTimeout(120_000);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Fixture exige banco local");
  const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const org = randomUUID();
  const channel = randomUUID();
  const contact = randomUUID();
  const conversation = randomUUID();
  const email = `trial-${randomUUID()}@example.test`;
  const password = "SomenteFixtureLocal-2026!";
  let userId: string | undefined;
  const cadastro = new Date(Date.now() - 2 * 86400_000).toISOString();
  const fim = new Date(Date.parse(cadastro) + 7 * 86400_000).toISOString();
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  const check = (result: { error: { message: string } | null }) => { if (result.error) throw new Error(result.error.message); };
  try {
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Pessoa QA", locale: "pt-BR" } });
    check(created);
    userId = created.data.user!.id;
    check(await db.from("organizations").insert({ id: org, slug: org, display_name: "Empresa de demonstração", legal_name: "Empresa de demonstração", created_at: cadastro, created_by: userId }));
    check(await db.from("user_organizations").insert({ user_id: userId, organization_id: org, role: "admin", accepted_at: new Date().toISOString() }));
    check(await db.from("channel_sessions").insert({ id: channel, organization_id: org, waha_session_name: `fixture_${channel}`, display_name: "WhatsApp QA", webhook_secret_encrypted: "e2e", status: "WORKING" }));
    check(await db.from("contacts").insert({ id: contact, organization_id: org, display_name: "Contato de demonstração", phone_number: "+5511999990000" }));
    check(await db.from("conversations").insert({ id: conversation, organization_id: org, contact_id: contact, channel_session_id: channel, status: "open", last_message_preview: "Olá!", last_inbound_at: new Date().toISOString(), last_message_at: new Date().toISOString() }));

    await page.goto("/login");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: /entrar/i }).click();
    await expect(page).toHaveURL(/\/onboarding/);
    const banner = page.getByTestId("periodo-de-teste");
    await expect(banner).toContainText("Você está no período de testes grátis");
    await expect(banner.locator("time")).toHaveAttribute("datetime", fim);
    await page.reload();
    await expect(banner.locator("time")).toHaveAttribute("datetime", fim);
    await page.getByRole("button", { name: "Explorar o CRM", exact: true }).first().click();
    await expect(page).toHaveURL(/\/app/);
    await page.goto(`/app/inbox?id=${conversation}`);
    const composer = page.getByRole("textbox", { name: "Mensagem", exact: true });
    await expect(composer).toBeVisible();
    await expect(page.getByText("Nenhuma mensagem nesta conversa.", { exact: true })).toBeVisible();
    await expect(banner.locator("time")).toHaveAttribute("datetime", fim);
    mkdirSync(".superpowers/evidence/periodo-de-testes", { recursive: true });
    for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await expect(composer).toBeInViewport();
      const bounds = await composer.boundingBox();
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `.superpowers/evidence/periodo-de-testes/conversas-${viewport.width}.png` });
      await banner.screenshot({ path: `.superpowers/evidence/periodo-de-testes/aviso-${viewport.width}.png` });
    }

    // Alteração exclusiva da fixture: prova o estado vencido sem bloquear a conta.
    check(await db.from("organizations").update({ created_at: new Date(Date.now() - 8 * 86400_000).toISOString() }).eq("id", org));
    await page.reload();
    await expect(banner).toContainText("Seu período de testes terminou");
    await expect(banner).not.toContainText("Tempo restante:");
    await expect(composer).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    check(await db.from("conversations").delete().eq("id", conversation).eq("organization_id", org));
    check(await db.from("contacts").delete().eq("id", contact).eq("organization_id", org));
    check(await db.from("channel_sessions").delete().eq("id", channel).eq("organization_id", org));
    check(await db.from("user_organizations").delete().eq("organization_id", org));
    check(await db.from("organizations").delete().eq("id", org));
    if (userId) check(await db.auth.admin.deleteUser(userId));
  }
});
