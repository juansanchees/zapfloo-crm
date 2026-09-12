import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test("zoom legível, clicável e sem sobrepor adicionar nó nos dois temas", async ({ page }) => {
  test.setTimeout(90_000);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Fixture exige banco local");
  const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const org = randomUUID(), flow = randomUUID();
  const email = `canvas-${randomUUID()}@example.test`, password = "SomenteFixtureLocal-2026!";
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
    const buttons = page.locator(".react-flow__controls-button");
    await expect(buttons).toHaveCount(4);
    mkdirSync(".superpowers/evidence/fluxo-controles", { recursive: true });
    for (const theme of ["dark", "light"]) {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(theme => document.documentElement.setAttribute("data-theme", theme), theme);
        await buttons.first().scrollIntoViewIfNeeded();
        const contrast = await buttons.first().evaluate(el => {
          const style = getComputedStyle(el);
          const luminance = (color: string) => {
            const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => {
              const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
            });
            return rgb[0]! * .2126 + rgb[1]! * .7152 + rgb[2]! * .0722;
          };
          const a = luminance(style.color), b = luminance(style.backgroundColor);
          return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        });
        expect(contrast).toBeGreaterThanOrEqual(4.5);
        const bounds = await buttons.first().boundingBox();
        expect(bounds!.width).toBeGreaterThanOrEqual(36);
        const viewport = page.locator(".react-flow__viewport");
        const before = await viewport.getAttribute("style");
        await buttons.nth(1).click();
        await expect(viewport).not.toHaveAttribute("style", before!);
        await buttons.first().click();
        if (width === 390) {
          const add = await page.getByRole("button", { name: "Adicionar nó", exact: true }).boundingBox();
          const controls = await page.locator(".react-flow__controls").boundingBox();
          expect(add!.x + add!.width <= controls!.x || controls!.x + controls!.width <= add!.x).toBe(true);
        }
        await buttons.nth(2).click();
        await page.getByTestId("flow-canvas").screenshot({ path: `.superpowers/evidence/fluxo-controles/${theme}-${width}.png` });
      }
    }
    // Falha de fornecedor controlada: prova UX, não uma chamada real de IA.
    let attempts = 0;
    await page.route("**/api/v1/ai/followup-flows/generate", async route => {
      attempts++;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({
        error: { code: "ai_credential_error", message: "Revise a credencial do provedor de IA." },
      }) });
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/ai/followups");
    await page.getByRole("button", { name: "Novo fluxo", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nome").fill("Boas-vindas QA");
    const description = "Espere uma hora, envie uma mensagem e encerre.";
    await dialog.getByLabel("Descreva o fluxo").fill(description);
    await dialog.getByRole("button", { name: "Gerar rascunho" }).click();
    await expect(dialog.getByRole("link", { name: "Revisar chaves de IA" })).toBeVisible();
    await expect(dialog.getByLabel("Descreva o fluxo")).toHaveValue(description);
    expect(attempts).toBe(1);
    await dialog.screenshot({ path: ".superpowers/evidence/fluxo-controles/credencial-recusada.png" });
  } finally {
    check(await db.from("followup_flow_pointers").delete().eq("id", flow).eq("organization_id", org));
    check(await db.from("user_organizations").delete().eq("organization_id", org));
    check(await db.from("organizations").delete().eq("id", org));
    if (userId) check(await db.auth.admin.deleteUser(userId));
  }
});
