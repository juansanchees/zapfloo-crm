import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { decidirElegibilidade } from "@/lib/ai/elegibilidade/gate";
import { lerNumerosDeTeste, numeroPodeTestar } from "@/lib/ai/elegibilidade/pre-go-live";

// HTTP sintético exclusivo do harness. O canal abaixo é fixture de banco:
// isto prova UI/actions/Postgres/gate, nunca o pareamento ou transporte WAHA.
test.describe.configure({ timeout: 150_000 });
for (const locale of ["pt-BR", "es"] as const) test(`jornada revisada até ativação restrita em ${locale}`, async ({ page }) => {
  test.skip(process.env.E2E_ONBOARDING_SYNTHETIC_PROVIDER !== "1", "Exige o preload HTTP sintético do harness; não chamar IA real.");
  if (process.env.OPENAI_API_KEY !== "onboarding-local-provider-only") throw new Error("Somente chave sintética permitida.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Somente banco local.");
  const svc = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const requests: Record<string, unknown>[] = [];
  const receiver = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ id: "resp_qa", object: "response", created_at: 1788894000, status: "completed", model: "qa-jornada-text",
      output: [{ id: "msg_qa", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Resposta sintética local: posso ajudar com um orçamento.", annotations: [] }] }],
      usage: { input_tokens: 20, output_tokens: 15, total_tokens: 35, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } }, error: null, incomplete_details: null }));
  });
  await new Promise<void>(resolve => receiver.listen(54380, "127.0.0.1", resolve));
  const org = randomUUID(); const channel = randomUUID();
  const email = `jornada-${randomUUID()}@example.test`; const password = "SomenteFixtureLocal-2026!";
  const translated = (pt: string, es: string) => locale === "es" ? es : pt;
  try {
    const created = await svc.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Operador sintético QA", locale } });
    if (created.error || !created.data.user) throw created.error ?? new Error("Fixture de usuário falhou");
    const user = created.data.user.id;
    const orgWrite = await svc.from("organizations").insert({ id: org, slug: org, legal_name: "Negócio sintético QA", display_name: "Negócio sintético QA", locale });
    if (orgWrite.error) throw orgWrite.error;
    const membership = await svc.from("user_organizations").insert({ user_id: user, organization_id: org, role: "admin", accepted_at: new Date().toISOString() });
    if (membership.error) throw membership.error;
    const modelWrite = await svc.from("ai_models").upsert({ provider: "openai", model_id: "qa-jornada-text", display_name: "QA jornada local", supports_tools: true }, { onConflict: "provider,model_id" });
    if (modelWrite.error) throw modelWrite.error;
    await page.goto("/login");
    mkdirSync("evidence/onboarding-jornada", { recursive: true });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(t => document.documentElement.setAttribute("data-theme", t), theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `evidence/onboarding-jornada/login-${locale}-${theme}.png`, fullPage: true });
    }
    await page.getByLabel(/e-?mail/i).fill(email);
    await page.getByLabel(/senha/i).fill(password);
    await page.getByRole("button", { name: /entrar/i }).click();
    await expect(page).toHaveURL(/\/onboarding\/welcome/);
    await page.goto("/onboarding/connect-whatsapp");
    await expect(page).toHaveURL(/\/onboarding\/welcome/);
    await page.getByRole("link", { name: translated("Criar meu agente", "Crear mi agente") }).focus();
    await page.keyboard.press("Enter");
    await page.locator("#display_name").fill("Oficina sintética QA");
    await page.locator("#segmento").selectOption("servicos");
    await page.locator("#o_que_faz").fill("Projetos sintéticos de demonstração");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(page).toHaveURL(/\/onboarding\/setup-ai/);
    await page.getByRole("link", { name: translated("Voltar ao negócio", "Volver al negocio") }).click();
    await expect(page.locator("#segmento")).toHaveValue("servicos");
    await expect(page.locator("#o_que_faz")).toHaveValue("Projetos sintéticos de demonstração");
    await expect(page.getByRole("checkbox")).toBeChecked();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(page).toHaveURL(/\/onboarding\/setup-ai/);
    await page.locator("#name").fill("Lia sintética QA");
    await page.locator("#objetivo").fill("Qualificar pedidos de orçamento");
    await page.locator("#regras_da_casa").fill("Não prometer preços sem confirmação humana.");
    await page.getByRole("button", { name: translated("Salvar rascunho", "Guardar borrador"), exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: translated("Rascunho salvo", "Borrador guardado") })).toBeVisible();
    await page.reload();
    await expect(page.locator("#objetivo")).toHaveValue("Qualificar pedidos de orçamento");
    await expect(page.getByText(/Ele ainda não tem cérebro|Todavía no tiene cerebro/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: translated("Configurar chave de IA", "Configurar clave de IA") })).toBeVisible();
    await page.locator("#ensaio-model").selectOption("openai/qa-jornada-text");
    await page.getByRole("button", { name: translated("Preparar ensaio", "Preparar ensayo"), exact: true }).click();
    await expect(page.getByRole("button", { name: translated("Preparar ensaio", "Preparar ensayo"), exact: true })).toBeEnabled();
    await page.locator("#ensaio-message").fill("Olá, preciso de um orçamento fictício.");
    const continuar = page.getByRole("button", { name: translated("Continuar para conexão", "Continuar a la conexión") });
    await expect(continuar).toBeDisabled();
    await page.getByRole("button", { name: translated("Testar mensagem", "Probar mensaje"), exact: true }).click();
    await expect(page.getByText("Resposta sintética local: posso ajudar com um orçamento.", { exact: true })).toBeVisible();
    await expect(continuar).toBeDisabled();
    await page.getByRole("button", { name: translated("Revisar resposta", "Revisar respuesta"), exact: true }).click();
    await expect(continuar).toBeEnabled();
    const draft = await svc.from("onboarding_drafts").select("prepared_agent_id,prepared_version_id,configuration").eq("organization_id", org).single();
    if (draft.error) throw draft.error;
    const agent = draft.data.prepared_agent_id!; const version = draft.data.prepared_version_id!;
    const assertInactive = async () => {
      const read = await svc.from("ai_agents").select("is_active,published_version_id").eq("id", agent).eq("organization_id", org).single();
      if (read.error) throw read.error;
      expect(read.data).toEqual({ is_active: false, published_version_id: null });
    };
    await assertInactive();
    expect(requests).toHaveLength(1); expect(requests[0]!.tools ?? []).toEqual([]);
    expect(JSON.stringify(requests[0])).toContain("Qualificar pedidos de orçamento");
    expect(JSON.stringify(requests[0])).toContain("Serviços, agência ou obra");
    mkdirSync("evidence/onboarding-jornada", { recursive: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: `evidence/onboarding-jornada/agente-${locale}-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `evidence/onboarding-jornada/agente-${locale}-celular.png`, fullPage: true });
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await page.screenshot({ path: `evidence/onboarding-jornada/agente-${locale}-celular-dark.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await continuar.focus(); await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/onboarding\/connect-whatsapp/);
    await assertInactive();
    // Não se conecta nenhum transporte. A sessão WORKING é fixture sintética.
    const channelWrite = await svc.from("channel_sessions").insert({ id: channel, organization_id: org, display_name: "Canal sintético QA", waha_session_name: `fixture_${channel}`, status: "WORKING", webhook_secret_encrypted: "\\x00", metadata: { ai_gate: "allowlist", ai_gate_mode: "pre_go_live", ai_test_phone_numbers: [] } });
    if (channelWrite.error) throw channelWrite.error;
    await page.getByRole("button", { name: translated("Conferir canais conectados", "Comprobar canales conectados") }).click();
    await page.locator("#canal-teste").selectOption(channel);
    const activate = page.getByRole("button", { name: translated("Ativar para estes números de teste", "Activar para estos números de prueba") });
    await expect(activate).toBeDisabled();
    await page.getByRole("button", { name: translated("Configurar acesso da IA", "Configurar acceso de la IA") }).click();
    await expect(page.getByRole("button", { name: translated("Liberar atendimento ao público", "Abrir la atención al público") })).toHaveCount(0);
    // A tela mantém a revisão que veio do GET. Outra aba pode abrir a política
    // ou editar os testadores antes do PATCH: nenhum dos dois pode ser desfeito.
    for (const change of ["open", "list"] as const) {
      await page.getByLabel(translated("Números autorizados para teste", "Números autorizados para prueba")).fill("+5511999998888");
      const concurrent = { ai_gate: change === "open" ? "open" : "allowlist", ai_gate_mode: "pre_go_live", ai_test_phone_numbers: change === "list" ? ["+5511999997777"] : [], transport_marker: "preservar" };
      const otherWrite = await svc.from("channel_sessions").update({ metadata: concurrent }).eq("organization_id", org).eq("id", channel);
      if (otherWrite.error) throw otherWrite.error;
      const conflict = page.waitForResponse(r => r.url().includes(`/channel-sessions/${channel}/ai-access`) && r.request().method() === "PATCH");
      await page.getByRole("button", { name: translated("Salvar lista de teste", "Guardar lista de prueba") }).click();
      expect((await conflict).status()).toBe(409);
      await expect(page.getByRole("alert").filter({ hasText: translated("Não foi possível confirmar o salvamento", "No se pudo confirmar el guardado") })).toBeVisible();
      const preserved = await svc.from("channel_sessions").select("metadata").eq("organization_id", org).eq("id", channel).single();
      expect(preserved.error).toBeNull(); expect(preserved.data?.metadata).toEqual(concurrent);
      await assertInactive();
      if (change === "list") await page.screenshot({ path: `evidence/onboarding-jornada/conflito-${locale}-celular.png`, fullPage: true });
      await page.getByRole("button", { name: "Cancelar", exact: true }).click();
      await expect(activate).toBeDisabled();
      // Nova tentativa deliberada da fixture; não é uma restauração pelo produto.
      const resetFixture = await svc.from("channel_sessions").update({ metadata: { ai_gate: "allowlist", ai_gate_mode: "pre_go_live", ai_test_phone_numbers: [], transport_marker: "preservar" } }).eq("organization_id", org).eq("id", channel);
      if (resetFixture.error) throw resetFixture.error;
      await page.getByRole("button", { name: translated("Configurar acesso da IA", "Configurar acceso de la IA") }).click();
      await expect(page.getByLabel(translated("Números autorizados para teste", "Números autorizados para prueba"))).toHaveValue("");
    }
    await page.getByLabel(translated("Números autorizados para teste", "Números autorizados para prueba")).fill("+5511999998888");
    await page.getByRole("button", { name: translated("Salvar lista de teste", "Guardar lista de prueba") }).click();
    await expect(activate).toBeEnabled();
    await assertInactive();
    await page.screenshot({ path: `evidence/onboarding-jornada/autorizacao-${locale}-celular.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await activate.focus(); await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: translated("Ativação restrita confirmada", "Activación restringida confirmada") })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: translated("Ativação restrita confirmada", "Activación restringida confirmada") })).toBeVisible();
    await page.screenshot({ path: `evidence/onboarding-jornada/recibo-${locale}-celular.png`, fullPage: true });
    const active = await svc.from("ai_agents").select("is_active,published_version_id").eq("id", agent).eq("organization_id", org).single();
    expect(active.error).toBeNull(); expect(active.data).toEqual({ is_active: true, published_version_id: version });
    const selected = await svc.from("channel_sessions").select("metadata").eq("id", channel).eq("organization_id", org).single();
    expect(selected.error).toBeNull(); expect(selected.data?.metadata).toMatchObject({ ai_gate: "allowlist", ai_gate_mode: "pre_go_live", ai_test_phone_numbers: ["+5511999998888"] });
    expect(selected.data?.metadata).toMatchObject({ transport_marker: "preservar" });
    for (const phone of ["+5511999998888", "+5511999997777"]) {
      const gate = decidirElegibilidade({ modo: "allowlist", preGoLiveAtivo: true, numeroDeTesteAutorizado: numeroPodeTestar(phone, lerNumerosDeTeste(selected.data?.metadata)), forceHuman: false, botSilencedUntil: null, assigneeKind: null, aiAuthorizedAt: new Date(), agora: new Date(), ttlMs: 1000 });
      expect(gate.permite).toBe(phone === "+5511999998888");
    }
    for (const table of ["messages", "event_log", "ai_agent_runs"] as const) {
      const read = await svc.from(table).select("id", { count: "exact", head: true }).eq("organization_id", org);
      expect(read.error).toBeNull(); expect(read.count).toBe(0);
    }
    expect(requests).toHaveLength(1);
    await page.goto("/onboarding/setup-ai");
    await expect(page.getByRole("button", { name: translated("Gerenciar agente existente", "Gestionar agente existente") })).toBeVisible();
    const viewer = await svc.from("user_organizations").update({ role: "viewer" }).eq("user_id", user).eq("organization_id", org);
    if (viewer.error) throw viewer.error;
    await page.goto("/onboarding"); await expect(page).toHaveURL(/\/app\/inbox/);
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(t => localStorage.setItem("deskcomm-theme", t), theme);
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.getByText(translated("Selecione uma conversa", "Selecciona una conversación"), { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `evidence/onboarding-jornada/inbox-${locale}-${theme}.png`, fullPage: true });
    }
  } finally { await new Promise<void>((resolve, reject) => receiver.close(error => error ? reject(error) : resolve())); }
});
