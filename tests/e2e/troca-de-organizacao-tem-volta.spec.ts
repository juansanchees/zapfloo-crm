import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";

import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { loginComoAdmin, lerCreds as lerCredsAdmin } from "./helpers/login-admin";

/**
 * TROCAR DE ORGANIZAÇÃO TEM VOLTA — mesmo quando a organização de destino
 * ainda não foi configurada.
 *
 * ─── O defeito, e como ele apareceu ──────────────────────────────────────
 *
 * `app/app/layout.tsx` manda para `/onboarding` toda organização ativa sem
 * `onboarded_at`. Então trocar de organização pelo seletor do topo — um clique,
 * a ação mais banal do cabeçalho — podia levar ao wizard de seis passos da
 * organização nova **e tirar o seletor da tela junto**: o layout de `/app` sai
 * inteiro da árvore, e o `TenantSwitcher` mora nele.
 *
 * O que sobrava, medido no snapshot de uma falha do CI (run 33164258175):
 * "Termos de Uso", "Política de Privacidade" e um "Continuar" desabilitado.
 * Três controles, nenhuma saída. Quem foi convidado para uma organização nova e
 * trocou para ver o que era ficava sem caminho de volta — limpar cookie ou
 * adivinhar a URL de logout.
 *
 * O vermelho do CI era outro (dois seeds disputando o mesmo slug deixavam a org
 * B sem onboarding), e essa parte se conserta no harness. Esta spec prende o
 * que o vermelho EXPÔS, que é de produto e sobrevive ao conserto do seed.
 *
 * ─── Por que a organização do seed de funis ──────────────────────────────
 *
 * Depois da separação dos slugs, `e2e-segunda-org` é o único lugar do harness
 * com uma organização legitimamente **não configurada** — e é exatamente o
 * fixture de que este caso precisa. Está escrito lá, no `insert`, para ninguém
 * "consertar" a ausência do `onboarded_at` achando que é descuido.
 */
const RAIZ = path.resolve(__dirname, "../..");

interface Creds {
  org_id: string;
  password: string;
  users: Record<string, { id: string; email: string } | undefined>;
  funis?: { segunda_org_id: string };
  duas_orgs?: { org_a_id: string };
}

function lerCreds(): Creds {
  const p = path.join(RAIZ, ".e2e-creds.json");
  if (!fs.existsSync(p)) throw new Error("`.e2e-creds.json` ausente — rode `scripts/seed-e2e-credentials.ts`");
  let c = JSON.parse(fs.readFileSync(p, "utf8")) as Creds;
  // A spec semeia a própria precondição: depender de `pipelines-gestao` ter
  // rodado antes seria depender da ORDEM, que é o defeito que esta suíte já
  // pagou mais de uma vez.
  if (!c.funis || !c.duas_orgs) {
    if (!c.duas_orgs) execFileSync("npx", ["tsx", "scripts/seed-e2e-duas-organizacoes.ts"], { stdio: "inherit" });
    if (!c.funis) execFileSync("npx", ["tsx", "scripts/seed-e2e-funis.ts"], { stdio: "inherit" });
    c = JSON.parse(fs.readFileSync(p, "utf8")) as Creds;
  }
  if (!c.funis?.segunda_org_id) throw new Error("o seed de funis não gravou `funis.segunda_org_id`");
  if (!c.duas_orgs?.org_a_id) throw new Error("o seed de duas orgs não gravou `duas_orgs.org_a_id`");
  return c;
}

async function entrar(page: Page, creds: Creds) {
  const usuario = creds.users.manager;
  if (!usuario) throw new Error(".e2e-creds.json sem o usuário `manager`");
  await page.goto("/login");
  await page.getByLabel(/e-?mail/i).fill(usuario.email);
  await page.getByLabel(/senha/i).fill(creds.password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/app(\/|$)/, { timeout: 20_000 });
}

test.describe.configure({ timeout: 150_000 });

test("ensaio explícito retoma seleção e só revisa resposta concluída da configuração atual", async ({ page }) => {
  const synthetic = process.env.E2E_ONBOARDING_SYNTHETIC_PROVIDER === "1";
  if (!synthetic && process.env.OPENAI_API_KEY) throw new Error("A prova sem chave exige OPENAI_API_KEY ausente.");
  if (synthetic && process.env.OPENAI_API_KEY !== "onboarding-local-provider-only") throw new Error("Somente chave sintética permitida.");
  const requests: Record<string, unknown>[] = [];
  const receiver = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ id: "resp_qa", object: "response", created_at: 1788894000, status: "completed", model: "qa-onboarding-text",
      output: requests.length === 2
        ? [{ id: "fc_qa", type: "function_call", call_id: "call_qa", name: "crm_send_whatsapp_message", arguments: JSON.stringify({ conversation_id: "11111111-1111-4111-8111-111111111111", body: "Mensagem sintética que não deve sair" }), status: "completed" }]
        : [{ id: "msg_qa", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: requests.length > 2 ? "A ferramenta não foi executada no teste." : "Olá! Esta é a resposta sintética local para revisão.", annotations: [] }] }],
      usage: { input_tokens: 20, output_tokens: 15, total_tokens: 35, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } }, error: null, incomplete_details: null }));
  });
  if (synthetic) await new Promise<void>(resolve => receiver.listen(54380, "127.0.0.1", resolve));
  try {
    const creds = lerCreds(); const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Somente banco local.");
    const svc = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const org = randomUUID();
    const { error: orgError } = await svc.from("organizations").insert({ id: org, slug: org, legal_name: "Ensaio QA", display_name: "Ensaio QA", onboarding_state: { welcome: { accepted_at: new Date().toISOString() }, connect_whatsapp: { skipped_at: new Date().toISOString() } } });
    if (orgError) throw orgError;
    const { error: memberError } = await svc.from("user_organizations").insert({ user_id: creds.users.admin!.id, organization_id: org, role: "admin", accepted_at: new Date().toISOString() });
    if (memberError) throw memberError;
    const { error: modelError } = await svc.from("ai_models").upsert({ provider: "openai", model_id: "qa-onboarding-text", display_name: "QA texto local", supports_tools: true }, { onConflict: "provider,model_id" });
    if (modelError) throw modelError;
    await page.goto("/login");
    await page.context().addCookies([{ name: "active_org", value: creds.org_id, url: new URL(page.url()).origin }]);
    await loginComoAdmin(page, lerCredsAdmin());
    await page.context().addCookies([{ name: "active_org", value: org, url: new URL(page.url()).origin }]);
    await page.goto("/onboarding/setup-ai");
    await page.getByLabel("Como ele vai se chamar").fill("Lia ensaio QA");
    await page.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Rascunho salvo" })).toBeVisible();
    await expect(page.getByLabel("Modelo do ensaio")).toHaveValue("");
    await page.getByLabel("Modelo do ensaio").selectOption("openai/qa-onboarding-text");
    await page.getByRole("button", { name: "Preparar ensaio", exact: true }).click();
    await expect(page.getByRole("button", { name: "Preparar ensaio", exact: true })).toBeEnabled();
    await page.reload();
    await expect(page.getByLabel("Modelo do ensaio")).toHaveValue("openai/qa-onboarding-text");
    await page.getByLabel("Mensagem de exemplo").fill("Olá, como funciona o atendimento?");
    await page.getByLabel("Mensagem de exemplo").press("Enter");
    await expect(page).toHaveURL(/\/onboarding\/setup-ai/);
    await page.getByRole("button", { name: "Testar mensagem", exact: true }).click();
    if (synthetic) {
      await expect(page.getByText("Olá! Esta é a resposta sintética local para revisão.", { exact: true })).toBeVisible();
      expect(requests).toHaveLength(1); expect(requests[0]!.model).toBe("qa-onboarding-text");
      expect(requests[0]!.tools ?? []).toEqual([]);
      await expect(page.getByRole("button", { name: "Revisar resposta", exact: true })).toBeEnabled();
      await page.getByRole("button", { name: "Revisar resposta", exact: true }).click();
      await expect(page.getByText("Resposta revisada. Nenhum atendimento foi ativado.", { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByText("Resposta revisada. Nenhum atendimento foi ativado.", { exact: true })).toBeVisible();
      await page.locator('[aria-labelledby="ensaio-title"]').screenshot({ path: test.info().outputPath("revisado-desktop.png") });
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.locator('[aria-labelledby="ensaio-title"]').screenshot({ path: test.info().outputPath("revisado-celular.png") });
      await page.setViewportSize({ width: 1280, height: 720 });
      const other = await page.context().newPage(); await other.goto(page.url());
      await other.getByLabel("Como ele vai se chamar").fill("Outro nome de Lia QA");
      await other.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
      await expect(other.getByRole("status").filter({ hasText: "Rascunho salvo" })).toBeVisible();
      await page.getByRole("button", { name: "Testar mensagem", exact: true }).click();
      await expect(page.getByRole("alert").filter({ hasText: "configuração ou organização mudou" })).toBeVisible();
      expect(requests).toHaveLength(1);
      await other.close();
    } else {
      await expect(page.getByRole("alert").filter({ hasText: "Não há chave utilizável" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Revisar resposta", exact: true })).toBeDisabled();
      await expect(page.getByLabel("Mensagem de exemplo")).toHaveValue(/Olá, como funciona/);
    }
    const { data: agents, error: agentError } = await svc.from("ai_agents").select("is_active,is_default,published_version_id").eq("organization_id", org);
    if (agentError) throw agentError;
    expect(agents).toEqual([{ is_active: false, is_default: false, published_version_id: null }]);
    for (const table of ["channel_sessions", "event_log", "ai_agent_runs"] as const) {
      const { count, error } = await svc.from(table).select("id", { count: "exact", head: true }).eq("organization_id", org);
      if (error) throw error; expect(count).toBe(0);
    }
    await page.getByRole("heading", { name: "Ensaio de conversa, sem envio" }).scrollIntoViewIfNeeded();
    await page.locator('[aria-labelledby="ensaio-title"]').screenshot({ path: test.info().outputPath(`${synthetic ? "sintetico" : "sem-chave"}-desktop.png`) });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("heading", { name: "Ensaio de conversa, sem envio" }).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('[aria-labelledby="ensaio-title"]').screenshot({ path: test.info().outputPath(`${synthetic ? "sintetico" : "sem-chave"}-celular.png`) });
    if (synthetic) {
      // Caminho legado real: UI → route → SDK → ponte MCP → trace persistido.
      // Só o provedor HTTP é sintético; nenhum canal é criado ou conectado.
      const { data: legacyAgent, error: legacyError } = await svc.from("ai_agents").select("id").eq("organization_id", org).single();
      if (legacyError) throw legacyError;
      const { error: versionError } = await svc.from("ai_agent_versions").update({ tool_ids: ["crm_send_whatsapp_message"], max_steps: 3, token_budget: 4000, cost_budget_cents: 100 }).eq("organization_id", org).eq("agent_id", legacyAgent.id);
      if (versionError) throw versionError;
      const { error: onboardError } = await svc.from("organizations").update({ onboarded_at: new Date().toISOString() }).eq("id", org);
      if (onboardError) throw onboardError;
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`/app/ai/agents/${legacyAgent.id}`);
      await page.getByRole("tab", { name: "Teste", exact: true }).click();
      await expect(page.getByText(/Ferramentas não são executadas neste teste/)).toBeVisible();
      await page.locator("#test-message").fill("Envie uma mensagem sintética de teste.");
      await page.getByRole("button", { name: "Executar teste", exact: true }).click();
      await expect(page.getByText("A ferramenta não foi executada no teste.", { exact: true })).toBeVisible({ timeout: 30_000 });
      expect(requests).toHaveLength(3);
      expect(JSON.stringify(requests[2])).toContain("dry_run_tool_blocked");
      await page.locator("summary").filter({ hasText: "crm_send_whatsapp_message" }).click();
      await expect(page.locator("pre").filter({ hasText: "dry_run_tool_blocked" })).toContainText('"executed": false');
      const { data: runs, error: runError } = await svc.from("ai_agent_runs").select("is_dry_run,status,outbound_message_id,tool_calls").eq("organization_id", org);
      if (runError) throw runError;
      expect(runs).toHaveLength(1);
      expect(runs![0]).toMatchObject({ is_dry_run: true, status: "completed", outbound_message_id: null });
      expect(JSON.stringify(runs![0]!.tool_calls)).toContain("dry_run_tool_blocked");
      for (const table of ["channel_sessions", "event_log", "messages"] as const) {
        const { count, error } = await svc.from(table).select("id", { count: "exact", head: true }).eq("organization_id", org);
        if (error) throw error; expect(count).toBe(0);
      }
      await expect(page.getByText("Teste executado.", { exact: true })).toBeHidden({ timeout: 10_000 });
      await page.getByRole("tabpanel").screenshot({ path: test.info().outputPath("legado-isolado-desktop.png") });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByText(/Ferramentas não são executadas neste teste/)).toBeVisible();
      const notice = await page.getByText(/Ferramentas não são executadas neste teste/).boundingBox();
      expect(notice).not.toBeNull();
      expect(notice!.x + notice!.width).toBeLessThanOrEqual(390);
      await page.getByRole("tabpanel").screenshot({ path: test.info().outputPath("legado-isolado-celular.png") });
    }
  } finally { if (synthetic) await new Promise<void>((resolve, reject) => receiver.close(error => error ? reject(error) : resolve())); }
});

test("rascunho retoma os campos e protege contra outra aba sem ativar atendimento", async ({ page }) => {
  const creds = lerCreds();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Fixture permitido apenas no banco local.");
  const svc = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const orgId = randomUUID();
  const { error: orgError } = await svc.from("organizations").insert({ id: orgId, slug: `e2e-draft-${orgId}`, legal_name: "Rascunho QA LTDA", display_name: "Rascunho QA" });
  if (orgError) throw orgError;
  const { error: memberError } = await svc.from("user_organizations").insert({ user_id: creds.users.admin!.id, organization_id: orgId, role: "admin", accepted_at: new Date().toISOString() });
  if (memberError) throw memberError;
  await page.goto("/login");
  await page.context().addCookies([{ name: "active_org", value: creds.org_id, url: new URL(page.url()).origin }]);
  await loginComoAdmin(page, lerCredsAdmin());
  await page.getByTestId("tenant-switcher").click();
  await page.getByTestId(`tenant-switcher-item-${orgId}`).click();
  await expect(page).toHaveURL(/\/onboarding\/welcome/);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding\/connect-whatsapp/);
  await page.getByRole("link", { name: "Configurar IA (opcional)", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding\/setup-ai/);
  const { data: before, error: beforeError } = await svc.from("organizations").select("onboarded_at,onboarding_state").eq("id", orgId).single();
  if (beforeError) throw beforeError;
  const other = await page.context().newPage();
  await other.goto(page.url());
  await expect(other.getByLabel("Como ele vai se chamar")).toBeVisible();
  await page.getByLabel("Como ele vai se chamar").fill("Atendente QA salvo");
  await page.getByRole("radio", { name: /Curto e prático/ }).check();
  await page.getByLabel("As regras da casa (opcional)").fill("Confirmar com uma pessoa antes de oferecer desconto.");
  await page.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Rascunho salvo." })).toBeVisible();
  await other.getByLabel("Como ele vai se chamar").fill("Alteração da outra aba QA");
  await other.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect(other.getByRole("alert").filter({ hasText: "mudou em outra aba" })).toBeVisible();
  await expect(other.getByLabel("Como ele vai se chamar")).toHaveValue("Alteração da outra aba QA");
  await other.close();
  await page.reload();
  await expect(page.getByLabel("Como ele vai se chamar")).toHaveValue("Atendente QA salvo");
  await expect(page.getByRole("radio", { name: /Curto e prático/ })).toBeChecked();
  await expect(page.getByLabel("As regras da casa (opcional)")).toHaveValue("Confirmar com uma pessoa antes de oferecer desconto.");
  for (const table of ["ai_agents", "ai_agent_versions", "channel_sessions"] as const) {
    const { count, error } = await svc.from(table).select("id", { count: "exact", head: true }).eq("organization_id", orgId);
    if (error) throw error;
    expect(count, `${table} não pode ser criado ao salvar configuração`).toBe(0);
  }
  const { data: after, error: afterError } = await svc.from("organizations").select("onboarded_at,onboarding_state").eq("id", orgId).single();
  if (afterError) throw afterError;
  expect(after).toEqual(before);
  // Duas organizações com revisão 1: a revisão sozinha não identifica a tela de origem.
  const orgB = randomUUID();
  const { error: orgBError } = await svc.from("organizations").insert({ id: orgB, slug: `e2e-draft-${orgB}`, legal_name: "Outra empresa QA LTDA", display_name: "Outra empresa QA" });
  if (orgBError) throw orgBError;
  const { error: memberBError } = await svc.from("user_organizations").insert({ user_id: creds.users.admin!.id, organization_id: orgB, role: "admin", accepted_at: new Date().toISOString() });
  if (memberBError) throw memberBError;
  const { error: draftBError } = await svc.rpc("fn_save_onboarding_draft", { p_org_id: orgB, p_actor_id: creds.users.admin!.id, p_expected_revision: 0, p_configuration: { name: "Nome exclusivo B", prompt_template: "support_minimal", regras_da_casa: "Regra B" } });
  if (draftBError) throw draftBError;
  const switchTab = await page.context().newPage();
  await switchTab.goto(page.url());
  await switchTab.getByTestId("sair-do-onboarding").click();
  await switchTab.getByTestId(`sair-do-onboarding-item-${orgB}`).click();
  await expect(switchTab).toHaveURL(/\/onboarding\/welcome/);
  await page.getByLabel("Como ele vai se chamar").fill("Campos da empresa A");
  await page.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "organização ou a sessão mudou" })).toBeVisible();
  const { data: draftB, error: readBError } = await svc.from("onboarding_drafts").select("revision,configuration").eq("organization_id", orgB).single();
  if (readBError) throw readBError;
  expect(draftB).toEqual({ revision: 1, configuration: { name: "Nome exclusivo B", prompt_template: "support_minimal", regras_da_casa: "Regra B" } });
  await switchTab.getByTestId("sair-do-onboarding").click();
  await switchTab.getByTestId(`sair-do-onboarding-item-${orgId}`).click();
  await expect(switchTab).toHaveURL(/\/onboarding\/connect-whatsapp/);
  await switchTab.getByRole("link", { name: "Configurar IA (opcional)", exact: true }).click();
  await expect(switchTab).toHaveURL(/\/onboarding\/setup-ai/);
  await switchTab.close();
  await page.reload();
  await expect(page.getByLabel("Como ele vai se chamar")).toHaveValue("Atendente QA salvo");
  await page.getByRole("button", { name: "Salvar rascunho", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("rascunho-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Como ele vai se chamar").scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("rascunho-celular.png") });
  await page.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Rascunho salvo." })).toBeVisible();
  await page.getByRole("status").filter({ hasText: "Rascunho salvo." }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("rascunho-salvo-celular.png") });
});

test("convidado troca para uma organização não configurada sem ficar preso no wizard", async ({ page }) => {
  const creds = lerCreds();
  const semOnboarding = creds.funis!.segunda_org_id;
  const orgA = creds.duas_orgs!.org_a_id;

  await entrar(page, creds);
  await page.goto("/app/inbox");

  // Ancora na org A e guarda o nome dela — é para cá que a volta tem de trazer.
  const seletor = page.getByTestId("tenant-switcher");
  await expect(seletor).toBeVisible({ timeout: 20_000 });
  await seletor.click();
  await page.getByTestId(`tenant-switcher-item-${orgA}`).click();
  await expect(seletor).toBeEnabled({ timeout: 60_000 });
  const nomeDaOrgA = (await seletor.textContent())!.trim();
  expect(nomeDaOrgA.length, "o seletor não anuncia o nome da organização ativa").toBeGreaterThan(0);

  // ── a troca que prendia ────────────────────────────────────────────────
  await seletor.click();
  await page.getByTestId(`tenant-switcher-item-${semOnboarding}`).click();

  // O manager não pode configurar a organização. Deve manter acesso ao CRM,
  // inclusive se abrir a URL do wizard diretamente (sem loop de redirects).
  await expect(seletor).toContainText("E2E Segunda Org", { timeout: 60_000 });
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/app\/inbox/, { timeout: 20_000 });
  await expect(seletor).toContainText("E2E Segunda Org");
  await seletor.click();
  await page.getByTestId(`tenant-switcher-item-${orgA}`).click();

  // ── e a volta CHEGA: o produto de novo, na organização de antes ────────
  await page.waitForURL(/\/app(\/|$)/, { timeout: 60_000 });
  const seletorDeVolta = page.getByTestId("tenant-switcher");
  await expect(seletorDeVolta, "voltei para o produto e o seletor não reapareceu").toBeVisible({
    timeout: 20_000,
  });
  await expect(seletorDeVolta).toBeEnabled({ timeout: 60_000 });
  await expect(
    seletorDeVolta,
    `a volta não trouxe para "${nomeDaOrgA}" — trocou de lugar, não desfez a troca`,
  ).toContainText(nomeDaOrgA, { timeout: 20_000 });

  await page.screenshot({ path: test.info().outputPath("troca-de-org-tem-volta.png") });
});

test("admin pendente mantém a saída do wizard para outra organização", async ({ page }) => {
  const creds = lerCreds();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
    throw new Error("Este fixture só pode alterar memberships no Supabase local de testes.");
  }
  const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const semOnboarding = creds.funis!.segunda_org_id;
  const { error } = await svc.from("user_organizations").upsert({
    user_id: creds.users.admin!.id,
    organization_id: semOnboarding,
    role: "admin",
    accepted_at: new Date().toISOString(),
    revoked_at: null,
  }, { onConflict: "user_id,organization_id" });
  if (error) throw error;

  await page.goto("/login");
  await page.context().addCookies([{ name: "active_org", value: creds.org_id, url: new URL(page.url()).origin }]);
  await loginComoAdmin(page, lerCredsAdmin());
  await page.getByTestId("tenant-switcher").click();
  await page.getByTestId(`tenant-switcher-item-${semOnboarding}`).click();
  await expect(page).toHaveURL(/\/onboarding\//, { timeout: 30_000 });
  await expect(page.getByTestId("onboarding-frame")).toBeVisible();
  const { data: antes, error: erroAntes } = await svc.from("organizations")
    .select("onboarded_at, onboarding_state").eq("id", semOnboarding).single();
  if (erroAntes) throw erroAntes;
  expect(antes.onboarded_at).toBeNull();
  await page.getByRole("banner").getByRole("button", { name: "Explorar o CRM" }).click({ timeout: 5_000 });
  await expect(page).toHaveURL(/\/app\/inbox/, { timeout: 30_000 });
  await expect(page.getByRole("link", { name: "Retomar configuração" })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/app\/inbox/);
  await expect(page.getByText("Sem conversas por aqui", { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: test.info().outputPath("explorar-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("link", { name: "Retomar configuração" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("explorar-celular.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  const { data: depois, error: erroDepois } = await svc.from("organizations")
    .select("onboarded_at, onboarding_state").eq("id", semOnboarding).single();
  if (erroDepois) throw erroDepois;
  expect(depois).toEqual(antes);
  await page.getByRole("link", { name: "Retomar configuração" }).click();
  await expect(page).toHaveURL(/\/onboarding\//, { timeout: 30_000 });
  await page.screenshot({ path: test.info().outputPath("estrutura-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("estrutura-celular.png"), fullPage: true });
  const saida = page.getByTestId("sair-do-onboarding");
  await expect(saida).toBeVisible();
  await saida.click();
  const item = page.getByTestId(`sair-do-onboarding-item-${creds.org_id}`);
  if (await item.count()) await item.click();
  await expect(page).toHaveURL(/\/app\/inbox/, { timeout: 30_000 });
  await expect(page.getByTestId("tenant-switcher")).toBeVisible();
  // Uma preferência anterior não substitui a prova de MFA da nova sessão.
  const preferencia = (await page.context().cookies()).find((c) => c.name === "onboarding_explore");
  expect(preferencia).toBeDefined();
  await page.context().clearCookies();
  await page.context().addCookies([
    preferencia!,
    { name: "active_org", value: semOnboarding, url: new URL(page.url()).origin },
  ]);
  await page.goto("/login");
  await page.locator("#email").fill(creds.users.admin!.email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page).toHaveURL(/\/login\/mfa/, { timeout: 30_000 });
  await page.goto("/app/inbox");
  await expect(page).toHaveURL(/\/login\/mfa/, { timeout: 10_000 });
});
