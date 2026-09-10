/**
 * O WIZARD, PELA TELA, DENTRO DO CI.
 *
 * A jornada de instalação fresca é a P0 da doutrina de QA deste projeto — é o
 * produto que se vende. A prova real de pareamento fica separada porque exige
 * WAHA/Redis reais e scan manual; esta spec mantém no CI os contratos que não
 * dependem desses serviços.
 *
 * Esta spec cobre o que dá para cobrir sem esses serviços — que é quase tudo:
 * a ordem inicial, a opção de adiar IA, o funil e a conclusão pela equipe.
 *
 * ISOLAMENTO: cria a PRÓPRIA organização, com o próprio dono. O seed do CI
 * entrega a organização compartilhada já onboardada, e zerar o estado dela para
 * testar o wizard mandaria todas as specs seguintes para dentro do onboarding.
 */
import { randomUUID } from "node:crypto";

import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const SENHA = "WizardQa!2026#Deskcomm";
const email = `wizard-${randomUUID().slice(0, 8)}@qa.local`;

let userId = "";
let orgId = "";

/**
 * O estado que o `install.sh` deixa: dono criado, organização com o nome
 * placeholder, provedor de IA escolhido no terminal, e `onboarded_at` nulo.
 */
test.beforeAll(async () => {
  const { data: criado, error: errUser } = await svc.auth.admin.createUser({
    email,
    password: SENHA,
    email_confirm: true,
  });
  if (errUser || !criado.user) throw errUser ?? new Error("sem usuário");
  userId = criado.user.id;

  const { data: org, error: errOrg } = await svc
    .from("organizations")
    .insert({
      slug: `minha-empresa-${randomUUID().slice(0, 8)}`,
      display_name: "Minha Empresa",
      legal_name: "Minha Empresa",
      status: "active",
      created_by: userId,
      settings: { llm: { provider: "anthropic" } },
    })
    .select("id")
    .single();
  if (errOrg || !org) throw errOrg ?? new Error("sem org");
  orgId = org.id as string;

  await svc.from("user_organizations").insert({
    organization_id: orgId,
    user_id: userId,
    role: "admin",
    accepted_at: new Date().toISOString(),
  });
});

test.afterAll(async () => {
  if (orgId) {
    await svc.from("ai_agent_runs").delete().eq("organization_id", orgId);
    await svc.from("ai_agent_versions").delete().eq("organization_id", orgId);
    await svc.from("ai_agents").delete().eq("organization_id", orgId);
    await svc.from("org_memory_pointers").delete().eq("organization_id", orgId);
    await svc.from("org_memory_versions").delete().eq("organization_id", orgId);
    await svc.from("crm_stages").delete().eq("organization_id", orgId);
    await svc.from("crm_pipelines").delete().eq("organization_id", orgId);
    await svc.from("user_organizations").delete().eq("organization_id", orgId);
  }
  if (userId) await svc.auth.admin.deleteUser(userId);
});

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(SENHA);
  await page.getByRole("button", { name: /entrar/i }).click();
}

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("o wizard monta um funcionário", () => {
  test("abre mostrando o que a instalação já trouxe, e não pede o nome de novo", async ({
    page,
  }) => {
    await login(page);
    await page.waitForURL(/\/onboarding\/welcome/, { timeout: 30_000 });

    // O passo 1 começa pelo que já existe — em vez de um formulário em branco.
    await expect(page.getByText(/já está de pé/i)).toBeVisible();

    // O instalador nunca pergunta o nome do negócio: a organização nasce
    // "Minha Empresa". Mandar isso como valor inicial obrigava a pessoa a
    // apagá-lo, e quem não percebia ficava com o placeholder para sempre.
    await expect(page.locator("#display_name")).toHaveValue("");
  });

  test("o aceite de termos leva a documentos que EXISTEM", async ({ page }) => {
    // O checkbox é obrigatório e linkava duas páginas que respondiam 404.
    for (const href of ["/legal/terms", "/legal/privacy"]) {
      const res = await page.request.get(href);
      expect(res.status(), href).toBe(200);
    }
  });

  test("o nome do negócio chega ao cabeçalho do passo seguinte", async ({ page }) => {
    await login(page);
    await page.waitForURL(/\/onboarding\/welcome/, { timeout: 30_000 });

    await page.locator("#display_name").fill("Clínica Bem Viver");
    await page.locator('input[type="checkbox"]').check();
    await page.getByRole("button", { name: /^continuar$/i }).click();
    await page.waitForURL(/\/onboarding\/connect-whatsapp/, { timeout: 30_000 });

    // A identidade persistente agora mora no aside do wizard; o header contém
    // marca e controles. Medir o h1 evita um falso positivo no body genérico.
    const identidade = page.locator("aside").getByRole("heading", { level: 1 });
    await expect(identidade).toHaveText("Clínica Bem Viver");
    await expect(identidade).not.toHaveText("Minha Empresa");
  });

  test("o passo do telefone pergunta COMO se conecta antes de assumir o código", async ({
    page,
  }) => {
    await login(page);
    await page.waitForURL(/\/onboarding\/connect-whatsapp/, { timeout: 30_000 });

    // As três formas que o produto realmente suporta — as mesmas da tela de
    // Conexões. Antes, o wizard oferecia uma e nem perguntava: a sessão do
    // canal por código subia sozinha na montagem da tela.
    await expect(page.getByTestId("forma-qr")).toBeVisible();
    await expect(page.getByTestId("forma-oficial")).toBeVisible();
    await expect(page.getByTestId("forma-parceiro")).toBeVisible();

    // Nenhuma escolha feita: o código não pode estar na tela ainda.
    await expect(page.locator('img[src*="/whatsapp/qr"]')).toHaveCount(0);

    // A cópia visível fala a língua de quem vende, nunca a do transporte.
    const corpo = page.locator("body");
    await expect(corpo).not.toContainText(/provider/i);
    await expect(corpo).not.toContainText(/channel_session/i);

    // Escolher a conta oficial leva ao formulário dela, e dá para voltar —
    // escolher errado não pode ser uma porta que tranca.
    await page.getByTestId("forma-oficial").locator("input").click();
    await expect(page.getByTestId("canal-oficial-root")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("voltar-para-escolha").click();
    await expect(page.getByTestId("forma-qr")).toBeVisible();

    // NÃO avança: a spec é serial e o caso seguinte começa neste mesmo passo.
    // A escolha vive em memória e não é gravada, então voltar aqui não deixa
    // rastro — se deixasse, o passo já contaria como cumprido.
  });

  test("o passo do telefone não expõe identificador interno nem enum", async ({ page }) => {
    await login(page);
    await page.waitForURL(/\/onboarding\/connect-whatsapp/, { timeout: 30_000 });

    const corpo = page.locator("body");
    // Mostrava "Sessão: org_f3d61bc0" e "Status: INIT".
    await expect(corpo).not.toContainText(/Sessão:/i);
    await expect(corpo).not.toContainText(/Status:\s*(INIT|STARTING|SCAN_QR_CODE|WORKING)/);
    // E nunca mais manda rodar Docker nem aponta para um menu que não existe.
    await expect(corpo).not.toContainText(/docker compose/i);
    await expect(corpo).not.toContainText(/Configurações → Canais/i);

    // Fixture estreita para os casos de funil abaixo. Não prova pareamento nem
    // oferece um atalho inexistente na UI: a jornada fresca real é outra spec.
    const atual = await svc.from("organizations").select("onboarding_state").eq("id", orgId).single();
    if (atual.error) throw atual.error;
    const preparado = await svc.from("organizations").update({
      onboarding_state: {
        ...((atual.data.onboarding_state as Record<string, unknown> | null) ?? {}),
        whatsapp: { status: "skipped", skipped: true },
      },
    }).eq("id", orgId);
    if (preparado.error) throw preparado.error;
    await page.goto("/onboarding/setup-ai");
  });

  test("a IA é opcional e pode ser adiada sem criar ou publicar agente", async ({ page }) => {
    await login(page);
    await page.waitForURL(/\/onboarding\/setup-ai/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /treine seu funcionário/i })).toBeVisible();
    await expect(page.getByText(/ele já vem sabendo/i)).toBeVisible();
    await expect(page.getByText(/e nunca vai fazer/i)).toBeVisible();
    const configurarChave = page.getByRole("button", { name: "Configurar chave de IA", exact: true });
    await expect(configurarChave).toBeEnabled();
    await configurarChave.click();
    await expect(page).toHaveURL(/\/app\/ai\/credentials/);
    await expect(page.getByRole("link", { name: "Retomar configuração", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Retomar configuração", exact: true }).click();
    await expect(page).toHaveURL(/\/onboarding\/setup-ai/);
    await page.getByRole("button", { name: "Adiar IA e continuar", exact: true }).click();
    await page.waitForURL(/\/onboarding\/funil/, { timeout: 30_000 });
    const agentes = await svc.from("ai_agents").select("id", { count: "exact", head: true }).eq("organization_id", orgId);
    expect(agentes.error).toBeNull();
    expect(agentes.count).toBe(0);
  });

  test("o quadro chega montado, venha da IA ou de um modelo pronto", async ({ page }) => {
    // ⚠️ ESTE CASO VALE NOS DOIS MUNDOS, DE PROPÓSITO. No CI não há chave de
    // provedor nenhum e a sugestão cai no quadro pronto; na máquina de quem
    // desenvolve, `next start` carrega o `.env.local` sozinho e a chave real
    // chega ao servidor sob teste — então a MESMA spec via a IA responder aqui e
    // o pacote no CI. Fixar uma das duas origens faria o gate vermelhar conforme
    // a máquina, que é o pior tipo de teste: o que ensina a ignorá-lo.
    //
    // O que NÃO varia é o que este passo promete: a pessoa nunca fica sem
    // quadro, e a tela diz de onde ele veio.
    await login(page);
    await page.waitForURL(/\/onboarding\/funil/, { timeout: 30_000 });

    const corpo = page.locator("body");
    await expect(
      corpo,
      "a tela precisa dizer se a sugestão veio da IA ou de um modelo pronto",
    ).toContainText(/montou este quadro|não consegui pedir uma sugestão/i);

    // O quadro está lá, montado, com o destino de cada coluna visível — que é a
    // metade invisível do defeito: medido, 312 etapas no banco e 4 com destino,
    // o que deixa o assistente incapaz de mover um card.
    const colunas = page.locator('input[aria-label^="Nome da coluna"]');
    expect(await colunas.count()).toBeGreaterThanOrEqual(4);
    await expect(corpo).toContainText(/Ele move o cliente para cá quando fechou negócio/i);
    await expect(corpo).toContainText(/Ele move o cliente para cá quando não fechou/i);

    // As colunas de desfecho não podem ser removidas: sem elas o banco recusa o
    // quadro inteiro, e descobrir isso no clique de salvar seria pior.
    await expect(page.getByText("obrigatória").first()).toBeVisible();

    // E o que a instalação trouxe fica à vista, para a troca não parecer mágica.
    await expect(corpo).toContainText(/Carrinho abandonado/);
  });

  test("dá para trocar por um modelo pronto sem depender de IA nenhuma", async ({ page }) => {
    // O caminho determinístico do plano B, que não depende de haver chave: é o
    // que sobra para quem instalou e ainda não configurou provedor — e para
    // quem simplesmente não gostou da sugestão.
    await login(page);
    await page.waitForURL(/\/onboarding\/funil/, { timeout: 30_000 });

    await page.getByRole("button", { name: /modelo pronto/i }).click();
    await page.getByRole("button", { name: /clínica, consultório ou salão/i }).click();

    await expect(page.locator("#nome_do_quadro")).toHaveValue("Agendamentos");
    await expect(page.locator('input[aria-label="Nome da coluna 1"]')).toHaveValue("Novo contato");
  });

  test("coluna sem nome barra o salvar, em vez de sumir calada", async ({ page }) => {
    // `normalizarProposta` DESCARTA nome vazio. Sem esta trava, a pessoa
    // acrescenta uma coluna, esquece de nomeá-la, salva, avança — e a coluna
    // simplesmente não existe.
    await login(page);
    await page.waitForURL(/\/onboarding\/funil/, { timeout: 30_000 });

    // Abre espaço primeiro. O teto de colunas é real e o botão desabilita nele:
    // localmente a sugestão da IA às vezes já chega com as 8, e um teste que
    // assumisse espaço livre vermelharia conforme a resposta do modelo. Remover
    // antes de acrescentar também é o que o dono faz — tira o que não serve e
    // põe o que falta.
    await page.getByRole("button", { name: /^remover$/i }).last().click();
    await page.getByRole("button", { name: /adicionar coluna/i }).click();
    await expect(page.getByText(/dê um nome à coluna em branco/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /usar este quadro/i })).toBeDisabled();

    // Nomeada, o caminho destrava.
    await page.locator('input[aria-label^="Nome da coluna"]').last().fill("Confirmação da véspera");
  });

  test("salvar troca o funil de e-commerce e ENSINA o destino de cada coluna", async ({ page }) => {
    await login(page);
    await page.waitForURL(/\/onboarding\/funil/, { timeout: 30_000 });
    await page.getByRole("button", { name: /usar este quadro/i }).click();
    await page.waitForURL(/\/onboarding\/invite-team/, { timeout: 30_000 });

    const { data: funil } = await svc
      .from("crm_pipelines")
      .select("id, name")
      .eq("organization_id", orgId)
      .eq("is_default", true)
      .maybeSingle();

    const { data: etapas } = await svc
      .from("crm_stages")
      .select("name, agent_stage_hint, is_won, is_lost")
      .eq("pipeline_id", funil!.id)
      .order("position");

    const nomes = (etapas ?? []).map((e) => String(e.name));
    // O quadro que o gatilho semeia em TODA organização, num produto que se
    // vende como multi-nicho: a clínica abria o quadro dela e lia isto.
    expect(nomes).not.toContain("Carrinho abandonado");
    expect(nomes).not.toContain("Em separação");
    expect(String(funil!.name)).not.toBe("Pedidos");

    // A metade invisível: sem destino, o funcionário tem o funil no escopo e
    // não sabe o que significa nenhuma coluna.
    const comDestino = (etapas ?? []).filter((e) => e.agent_stage_hint !== null);
    expect(comDestino.length).toBeGreaterThanOrEqual(5);
    // Uma de ganho e uma de perda, e o destino delas COERENTE com a marcação —
    // é o que o CHECK `crm_stages_hint_coerente_com_won_lost` cobra.
    expect((etapas ?? []).filter((e) => e.is_won)).toHaveLength(1);
    expect((etapas ?? []).filter((e) => e.is_lost)).toHaveLength(1);
    for (const e of etapas ?? []) {
      expect(e.is_won, String(e.name)).toBe(e.agent_stage_hint === "won");
      expect(e.is_lost, String(e.name)).toBe(e.agent_stage_hint === "lost");
    }
  });

  test("o wizard termina apresentando o sistema, e o resumo não acusa passo inexistente", async ({
    page,
  }) => {
    await login(page);
    await page.waitForURL(/\/onboarding\/invite-team/, { timeout: 30_000 });
    await page.getByRole("button", { name: /pular por enquanto/i }).click();
    await page.waitForURL(/\/onboarding\/done/, { timeout: 30_000 });

    // O tour: as peças apresentadas pelo que fazem.
    await expect(page.getByText(/o que mais tem aqui/i)).toBeVisible();
    await expect(page.getByText(/voltar a falar com quem sumiu/i)).toBeVisible();

    // A integração de loja vem desligada: o passo não existe nesta instalação,
    // e o resumo listava "Loja Nuvemshop (pulado)" — acusando a pessoa de não
    // fazer o que ninguém lhe ofereceu.
    await expect(page.locator("body")).not.toContainText(/Nuvemshop/i);

    await page.getByRole("button", { name: /começar a usar/i }).click();
    await page.waitForURL(/\/app\//, { timeout: 30_000 });

    const { data: org } = await svc
      .from("organizations")
      .select("onboarded_at, display_name")
      .eq("id", orgId)
      .maybeSingle();
    expect(org?.onboarded_at).toBeTruthy();
    expect(org?.display_name).toBe("Clínica Bem Viver");
  });
});
