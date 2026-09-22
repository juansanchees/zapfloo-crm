/**
 * Navegação compacta — prova pela TELA (DoD item 12).
 *
 * Os testes unitários provam que o registro e os componentes fazem o que
 * dizem. Isto prova o que o usuário reclamou: que dá para *achar* as coisas.
 * O caso que originou a mudança é o primeiro — chegar em Funis sem saber que
 * ele morava em Configurações.
 *
 * Pré-requisito: `.e2e-creds.json` (gerado por scripts/seed-e2e-credentials.ts).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";

import { test, expect, type Page } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";
import { afirmarAdminDeTenantPuro } from "./utils/precondicao";

let creds = lerCreds();
const EVIDENCE = path.join(process.cwd(), ".superpowers", "evidence");
const MENU_EVIDENCE = path.join(EVIDENCE, "menu-telas-sem-porta");
const FOOTER_EVIDENCE = path.join(EVIDENCE, "rodape-e-mes-de-brasilia");

mkdirSync(EVIDENCE, { recursive: true });

// ── Precondição de identidade ────────────────────────────────────────────────
// O menu é `compactAreas(isPlatformAdmin, role)`, então
// a suspeita natural é que promover o `e2e-admin` a dono do servidor inflasse o
// sidebar que esta spec mede item a item.
//
// ⚠️ MEDIDO, e a suspeita não se confirma: `canSee` (`registry.ts:503-507`) é
// `isPlatformAdmin || ROLE_RANK[role] >= ROLE_RANK[minRole]`; `ROLE_RANK.admin`
// é 5, o TETO, e o maior `minRole` do registro é `"admin"`. Para um admin de
// tenant o menu é IDÊNTICO promovido ou não — as asserções de `toHaveText`
// abaixo não mudariam. Guardar a identidade aqui continua valendo (é a spec de
// navegação; qualquer destino futuro exclusivo do dono apareceria primeiro
// nela), mas registrar a diferença entre "muda" e "poderia mudar" é o ponto.
test.beforeAll(async () => {
  await afirmarAdminDeTenantPuro(creds.users.admin!.email);
});

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/app\//);
}

async function loginAdmin(page: Page): Promise<void> {
  creds = await loginComoAdmin(page, creds);
}

const sidebar = (page: Page) => page.getByRole("navigation", { name: "Navegação principal" });
const rodapeFixo = (page: Page) => page.getByTestId("sidebar-persistent-footer");

async function capturarRodapeFixo(page: Page, width: 1280 | 1366) {
  await page.setViewportSize({ width, height: 768 });

  const medida = await page
    .locator("aside")
    .first()
    .evaluate((aside) => {
      const nav = aside.querySelector<HTMLElement>('nav[aria-label="Navegação principal"]')!;
      const footer = aside.querySelector<HTMLElement>('[data-testid="sidebar-persistent-footer"]')!;
      const config = footer.querySelector<HTMLAnchorElement>('a[aria-label="Configurações"]')!;
      const navRect = nav.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      const configRect = config.getBoundingClientRect();
      const itens = [...nav.querySelectorAll<HTMLAnchorElement>("a[aria-label]")].map((link) => {
        const rect = link.getBoundingClientRect();
        return {
          nome: link.getAttribute("aria-label"),
          visivel_sem_rolar: rect.top >= navRect.top && rect.bottom <= navRect.bottom,
        };
      });

      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        menu_rolavel: {
          client_height: nav.clientHeight,
          scroll_height: nav.scrollHeight,
          itens_abaixo_da_dobra: itens
            .filter((item) => !item.visivel_sem_rolar)
            .map((item) => item.nome),
        },
        configuracoes: {
          fora_da_area_rolavel: !nav.contains(config),
          dentro_do_rodape_fixo: footer.contains(config),
          visivel_na_viewport: configRect.top >= 0 && configRect.bottom <= window.innerHeight,
        },
        rodape: { top: footerRect.top, bottom: footerRect.bottom },
      };
    });

  expect(medida.configuracoes).toEqual({
    fora_da_area_rolavel: true,
    dentro_do_rodape_fixo: true,
    visivel_na_viewport: true,
  });

  mkdirSync(FOOTER_EVIDENCE, { recursive: true });
  const nome = `menu-${width}x768.png`;
  const captura = await page.locator("aside").first().screenshot();
  const caminho = path.join(FOOTER_EVIDENCE, nome);
  writeFileSync(caminho, captura);
  const sha256 = createHash("sha256").update(captura).digest("hex");
  expect(createHash("sha256").update(readFileSync(caminho)).digest("hex")).toBe(sha256);
  const prova = JSON.stringify({ ...medida, captura: { arquivo: nome, sha256 } }, null, 2);
  writeFileSync(path.join(FOOTER_EVIDENCE, `menu-${width}x768.json`), prova);
  console.info(`[menu-dobra ${width}x768] ${prova}`);
  await test.info().attach(`menu-${width}x768`, { body: prova, contentType: "application/json" });
}

async function expectSemOverflowHorizontal(page: Page, contexto: string): Promise<void> {
  const m = await page.evaluate(() => ({
    // ⚠️ `body.scrollWidth`, NÃO `documentElement`. `app/globals.css` põe
    // `overflow-x: hidden` em `html` E em `body` (linhas 422 e 440), e sob isso
    // o `scrollWidth` do `documentElement` é GRAMPEADO no `clientWidth`: a
    // conta dá zero mesmo com um filho de 3000px dentro. Medido com o chromium
    // do repo, viewport 390x844, filho de 3000px — `visible` → 2610,
    // `hidden` → 0, e `body.scrollWidth` = 3000 nos DOIS casos.
    //
    // A asserção existia e era incapaz de falhar. Trocar a medida é o conserto;
    // o caso de sabotagem ao lado é o que prova que a nova consegue.
    scrollWidth: document.body.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(
    m.scrollWidth,
    `${contexto}: documentElement.scrollWidth (${m.scrollWidth}) não pode passar do clientWidth (${m.clientWidth})`,
  ).toBeLessThanOrEqual(m.clientWidth + 1);
}

async function capturarSidebarCompleto(page: Page): Promise<void> {
  const viewportInicial = page.viewportSize();
  if (!viewportInicial) throw new Error("viewport ausente na prova do menu");

  const antes = await sidebar(page).evaluate((nav) => {
    const links = [...nav.querySelectorAll<HTMLAnchorElement>("a")];
    const instancias = links.find(
      (link) => link.getAttribute("aria-label") === "Instâncias WhatsApp",
    );
    const plano = links.find((link) => link.getAttribute("aria-label") === "Plano e pagamentos");
    const navRect = nav.getBoundingClientRect();
    const visivel = (link: HTMLAnchorElement | undefined) => {
      const rect = link?.getBoundingClientRect();
      return Boolean(rect) && rect!.top >= navRect.top && rect!.bottom <= navRect.bottom;
    };

    return {
      clientHeight: nav.clientHeight,
      scrollHeight: nav.scrollHeight,
      scrollTop: nav.scrollTop,
      rola: nav.scrollHeight > nav.clientHeight + 1,
      instancias: { existe: Boolean(instancias), dentro_da_area_visivel: visivel(instancias) },
      plano_e_pagamentos: { existe: Boolean(plano), dentro_da_area_visivel: visivel(plano) },
    };
  });
  const acrescimo = Math.max(0, antes.scrollHeight - antes.clientHeight) + 8;
  if (acrescimo > 8) {
    await page.setViewportSize({
      width: viewportInicial.width,
      height: viewportInicial.height + acrescimo,
    });
  }

  const medida = await sidebar(page).evaluate(
    (nav, provaInicial) => {
      const links = [...nav.querySelectorAll<HTMLAnchorElement>("a")];
      const plano = links.find((link) => link.getAttribute("aria-label") === "Plano e pagamentos");
      const navRect = nav.getBoundingClientRect();
      const planoRect = plano?.getBoundingClientRect();

      return {
        viewport_original: provaInicial.viewport,
        viewport_da_captura: { width: window.innerWidth, height: window.innerHeight },
        antes_de_ampliar: provaInicial.antes,
        client_height: nav.clientHeight,
        scroll_height: nav.scrollHeight,
        rola: nav.scrollHeight > nav.clientHeight + 1,
        secoes: [...nav.querySelectorAll("h2")].map((heading) => heading.textContent?.trim()),
        portas: links.map((link) => link.getAttribute("aria-label")),
        plano_e_pagamentos: {
          existe: Boolean(plano),
          dentro_da_area_visivel:
            Boolean(planoRect) &&
            planoRect!.top >= navRect.top &&
            planoRect!.bottom <= navRect.bottom,
        },
      };
    },
    { viewport: viewportInicial, antes },
  );

  expect(medida.rola, "a captura precisa mostrar o menu inteiro, sem parte escondida").toBe(false);
  expect(medida.plano_e_pagamentos).toEqual({ existe: true, dentro_da_area_visivel: true });

  mkdirSync(MENU_EVIDENCE, { recursive: true });
  const caminhoPng = path.join(MENU_EVIDENCE, "menu-lateral-completo.png");
  const captura = await page.locator("aside").first().screenshot();
  writeFileSync(caminhoPng, captura);
  const sha256 = createHash("sha256").update(captura).digest("hex");
  expect(createHash("sha256").update(readFileSync(caminhoPng)).digest("hex")).toBe(sha256);

  const prova = JSON.stringify(
    { ...medida, captura: { arquivo: path.basename(caminhoPng), sha256 } },
    null,
    2,
  );
  writeFileSync(path.join(MENU_EVIDENCE, "menu-lateral-completo.json"), prova);
  await test.info().attach("menu-lateral-completo", {
    body: prova,
    contentType: "application/json",
  });
}

// `loginComoAdmin` espera a virada da janela TOTP entre logins consecutivos
// (o servidor recusa código repetido), e essa espera sozinha pode consumir os
// 30 s do teto global do playwright.config.ts. Toda spec da casa que usa o
// helper sobe o teto — 240 s em `agente-novo-e-uso`, `agente-papeis-operador`,
// `escopo-de-funil-do-agente` e `capacidades-do-agente`; 90 s em
// `prova-painel-provedores`. Esta era a única que faltava, e por isso dois
// testes que já estavam verdes passaram a estourar 30 s.
test.describe.configure({ timeout: 120_000 });

test.describe("navegação compacta", () => {
  test("painel por papel usa dados locais reais e preserva navegação no desktop e celular", async ({
    page,
  }) => {
    // Esta jornada mede o tema escuro; seguir o SO agora exige uma escolha explícita.
    await page.addInitScript(() => localStorage.setItem("deskcomm-theme", "system"));
    await page.emulateMedia({ colorScheme: "dark" });
    await loginAdmin(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.setViewportSize({ width: 1280, height: 900 });
    await sidebar(page).getByRole("link", { name: "Painel de controle", exact: true }).click();
    // Esta rota é um Server Component que consulta o banco. O timeout padrão
    // de 5 s do `expect` media a latência do ambiente, não a navegação: o trace
    // mostrou o GET de `/app` correto ainda pendente quando a asserção morreu.
    await page.waitForURL(/\/app$/, { timeout: 30_000 });
    const summaryResponse = await page.request.get("/api/v1/dashboard/summary");
    expect(summaryResponse.ok()).toBe(true);
    const { data: summary } = (await summaryResponse.json()) as {
      data: {
        role_surface: "admin";
        hero: { id: string; value: string | number };
      };
    };
    expect(summary.role_surface).toBe("admin");
    const heroValue = String(summary.hero.value);
    const heroTitle = `${heroValue.replace("/", " de ")} instâncias conectadas`;
    await expect(page.getByRole("heading", { level: 1, name: heroTitle })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId(`dashboard-value-${summary.hero.id}`)).toHaveText(heroValue);
    await expect(
      page
        .getByRole("navigation", { name: "Navegação principal" })
        .getByRole("link", { name: "Painel de controle" }),
    ).toHaveAttribute("aria-current", "page");
    await expectSemOverflowHorizontal(page, "dashboard desktop");
    await expect(page.getByRole("status")).toHaveCount(0);
    await page.screenshot({ path: path.join(EVIDENCE, "dashboard-desktop.png"), fullPage: true });
    await page.getByRole("link", { name: "Ver instâncias", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/connections$/);
    await expect(
      sidebar(page).getByRole("link", { name: "Painel de controle" }),
    ).not.toHaveAttribute("aria-current");
    await page.goto("/app");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { level: 1, name: heroTitle })).toBeVisible();
    await expectSemOverflowHorizontal(page, "dashboard mobile");
    await expect(page.getByTestId(`dashboard-value-${summary.hero.id}`)).toHaveText(heroValue);
    await expect(page.getByRole("status")).toHaveCount(0);
    await page.screenshot({ path: path.join(EVIDENCE, "dashboard-mobile.png"), fullPage: true });
    await page.getByRole("link", { name: "Ver instâncias", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/connections$/);
  });

  test("o sidebar mostra onze portas roláveis e Configurações no rodapé fixo", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAdmin(page);

    const links = sidebar(page).getByRole("link");
    await expect(links).toHaveCount(11);
    expect(
      await links.evaluateAll((items) => items.map((item) => item.getAttribute("aria-label"))),
    ).toEqual([
      "Painel de controle",
      "Conversas",
      "Agentes de IA",
      "Funis de vendas",
      "Contatos",
      "Tarefas e agenda",
      "Metas",
      "Relatórios",
      "Instâncias WhatsApp",
      "Usuários e permissões",
      "Plano e pagamentos",
    ]);
    await expect(rodapeFixo(page).getByRole("link", { name: "Configurações" })).toBeVisible();
    await expect(sidebar(page).getByRole("heading", { name: "Operação" })).toBeVisible();
    await expect(sidebar(page).getByRole("heading", { name: "Equipe" })).toBeVisible();
    await expect(sidebar(page).getByRole("heading", { name: "Administração" })).toBeVisible();

    await capturarSidebarCompleto(page);
  });

  test("chega nas Etapas do funil pelo CRM, sem passar por Configurações", async ({ page }) => {
    await loginAdmin(page);

    // O caso que originou tudo: o usuário não sabia que esta tela existia.
    //
    // ⚠️ O ITEM MUDOU DE NOME, e o nome antigo ("Funis") passou para o VIZINHO —
    // a lista de funis, em /app/kanban. Um teste que continuasse clicando em
    // "Funis" seguiria verde medindo a outra tela; por isso a asserção de URL
    // abaixo é específica (`settings/tenant/pipelines`) e não o antigo
    // /pipelines/, que casa com as duas.
    //
    await sidebar(page).getByRole("link", { name: "Funis de vendas" }).click();
    await page.waitForURL(/\/app\/kanban/);
    const opcoes = page.getByRole("navigation", { name: /Funis de vendas.*Opções da área/ });
    await expect(opcoes.getByRole("link")).toHaveText([
      "Funis de vendas",
      "Leads",
      "Produtos",
      "Etapas do funil",
    ]);
    await page.screenshot({ path: path.join(EVIDENCE, "nav-area-funis.png"), fullPage: true });
    await opcoes.getByRole("link", { name: "Etapas do funil" }).click();
    await page.waitForURL(/settings\/tenant\/pipelines/);
    await expect(page.getByRole("heading", { name: "Etapas do funil", level: 1 })).toBeVisible();
  });

  test("e Produtos, que saiu do menu, continua alcançável pelo mesmo hub", async ({ page }) => {
    // Tirar do sidebar não pode virar tela órfã: DoD 14 cobra porta, e a porta
    // passou a ser o hub. Sem este caso, o item "some do menu" ficaria provado
    // e o "continua alcançável" ficaria só escrito no comentário.
    await loginAdmin(page);

    await expect(sidebar(page).getByRole("link", { name: "Produtos" })).toHaveCount(0);

    await sidebar(page).getByRole("link", { name: "Funis de vendas" }).click();
    await page.waitForURL(/\/app\/kanban/);
    await page
      .getByRole("navigation", { name: /Funis de vendas.*Opções da área/ })
      .getByRole("link", { name: "Produtos" })
      .click();
    await page.waitForURL(/\/app\/products/);
  });

  test("e a lista de funis é o item vizinho, com nome próprio", async ({ page }) => {
    await loginAdmin(page);
    await sidebar(page).getByRole("link", { name: "Funis de vendas", exact: true }).click();
    await page.waitForURL(/\/app\/kanban/);
    await expect(page.getByRole("heading", { name: "Funis", level: 1 })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("chega em Conhecimento, que só existia atrás das abas de IA", async ({ page }) => {
    await loginAdmin(page);

    await sidebar(page).getByRole("link", { name: "Agentes de IA", exact: true }).click();
    await page.waitForURL(/\/app\/ai$/);

    // O hub organiza por jornada, não numa grade solta.
    await expect(page.getByRole("heading", { name: "Montar o agente" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ensinar o agente" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Acompanhar o agente" })).toBeVisible();

    await page.screenshot({ path: path.join(EVIDENCE, "nav-hub-ia.png"), fullPage: true });

    await page
      .getByRole("navigation", { name: /Agentes de IA.*Opções da área/ })
      .getByRole("link", { name: "Conhecimento" })
      .click();
    await page.waitForURL(/knowledge\/sources/);
  });

  test("chega em Perfil pela porta principal de Configurações", async ({ page }) => {
    await loginAdmin(page);

    await rodapeFixo(page).getByRole("link", { name: "Configurações", exact: true }).click();
    await page.waitForURL(/\/app\/settings$/);
    await expect(page.getByRole("heading", { name: "Configurações", level: 1 })).toBeVisible();
    await page.getByRole("link", { name: /Perfil/ }).click();
    await page.waitForURL(/\/app\/settings\/profile$/);
  });

  /**
   * O canal oficial saiu de Configurações no PR #105 e virou aba de Conexões.
   * A porta, portanto, é Instâncias WhatsApp — um item primário da
   * Administração, em vez de um caminho escondido em Configurações.
   */
  test("chega ao canal oficial por Instâncias WhatsApp", async ({ page }) => {
    await loginAdmin(page);

    await sidebar(page).getByRole("link", { name: "Instâncias WhatsApp" }).click();
    await page.waitForURL(/\/app\/connections/);
    const comparativo = page.getByRole("region", { name: "Escolha sabendo a diferença" });
    await expect(comparativo).toBeVisible();
    await expect(comparativo.getByText("API Oficial da Meta", { exact: true })).toBeVisible();
    await expect(comparativo.getByText("Conexão por QR", { exact: true })).toBeVisible();
    await expect(comparativo.getByText(/não promete impedir banimento/i)).toBeVisible();
    await expect(page.getByRole("tab", { name: /oficial/i })).toBeVisible({ timeout: 30_000 });
  });

  test("o ⌘K acha o canal oficial por nome, mesmo sem tela própria", async ({ page }) => {
    await loginAdmin(page);

    // Ninguém procura por "Conexões" quando quer o número oficial da Meta —
    // procura por "oficial". A busca varre a descrição além do rótulo.
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByRole("combobox").fill("oficial");
    await expect(page.getByRole("option", { name: /Instâncias WhatsApp/ })).toBeVisible();
  });

  test("⌘K abre, filtra e navega", async ({ page }) => {
    await loginAdmin(page);

    await page.keyboard.press("ControlOrMeta+k");
    const busca = page.getByRole("combobox");
    await expect(busca).toBeVisible();

    await busca.fill("conhec");
    await expect(page.getByRole("option", { name: /Conhecimento/ })).toBeVisible();

    await page.screenshot({ path: path.join(EVIDENCE, "nav-command-palette.png") });

    await page.keyboard.press("Enter");
    await page.waitForURL(/knowledge\/sources/);
  });

  /**
   * A barra compacta precisa caber inteira: uma porta abaixo da dobra é uma
   * capacidade que o usuário não descobre.
   *
   * Medido por ferramenta, nunca a olho.
   */
  test("as onze portas roláveis cabem sem scroll em 900px", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAdmin(page);

    const m = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Navegação principal"]')!;
      const r = nav.getBoundingClientRect();
      return {
        rola: nav.scrollHeight > Math.round(r.height) + 1,
        links: nav.querySelectorAll("a").length,
      };
    });

    expect(m.links).toBe(11);
    expect(m.rola, "em 900px o menu inteiro tem de caber sem scroll").toBe(false);
  });

  test("em uma tela curta, Plano e pagamentos existe e aparece ao rolar o menu", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 684 });
    await loginAdmin(page);

    const medir = () =>
      sidebar(page).evaluate((nav) => {
        const navRect = nav.getBoundingClientRect();
        const links = [...nav.querySelectorAll<HTMLAnchorElement>("a")];
        const dados = (rotulo: string) => {
          const link = links.find((item) => item.getAttribute("aria-label") === rotulo);
          const rect = link?.getBoundingClientRect();
          return {
            existe: Boolean(link),
            visivel: Boolean(rect) && rect!.top >= navRect.top && rect!.bottom <= navRect.bottom,
          };
        };

        return {
          rola: nav.scrollHeight > nav.clientHeight + 1,
          instancias: dados("Instâncias WhatsApp"),
          pagamentos: dados("Plano e pagamentos"),
        };
      });

    const antes = await medir();
    expect(antes.rola).toBe(true);
    expect(antes.instancias.existe).toBe(true);
    expect(antes.pagamentos).toEqual({ existe: true, visivel: false });

    await sidebar(page).evaluate((nav) => {
      const instancias = [...nav.querySelectorAll<HTMLAnchorElement>("a")].find(
        (item) => item.getAttribute("aria-label") === "Instâncias WhatsApp",
      );
      instancias?.scrollIntoView({ block: "nearest" });
    });
    await expect.poll(async () => (await medir()).instancias.visivel).toBe(true);
    expect((await medir()).pagamentos.visivel).toBe(false);

    await sidebar(page).evaluate((nav) => nav.scrollTo({ top: nav.scrollHeight }));
    await expect.poll(async () => (await medir()).pagamentos.visivel).toBe(true);
  });

  test.describe("mobile", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("em 390px, o sidebar vira gaveta e não cria overflow horizontal", async ({ page }) => {
      await loginAdmin(page);

      await expect(
        sidebar(page),
        "o sidebar desktop fica fora da árvore acessível no mobile",
      ).toHaveCount(0);
      await expectSemOverflowHorizontal(page, "shell mobile após login");

      await page.getByRole("button", { name: "Abrir navegação" }).click();
      await expect(sidebar(page)).toBeVisible();
      await expectSemOverflowHorizontal(page, "shell mobile com drawer aberto");
      await page.screenshot({
        path: path.join(EVIDENCE, "nav-mobile-390-drawer-aberta.png"),
        fullPage: true,
      });

      await sidebar(page).getByRole("link", { name: "Funis de vendas", exact: true }).click();
      await page.waitForURL(/\/app\/kanban/);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expectSemOverflowHorizontal(page, "shell mobile após navegar pelo drawer");

      await page.screenshot({
        path: path.join(EVIDENCE, "nav-mobile-390-sem-overflow.png"),
        fullPage: true,
      });
    });
  });

  test("Configurações e Recolher menu ficam fixos no rodapé, fora da área que rola", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 768 });
    await loginAdmin(page);

    const recolher = page.getByRole("button", { name: "Recolher sidebar" });
    const configuracoes = rodapeFixo(page).getByRole("link", { name: "Configurações" });
    await expect(configuracoes).toBeVisible();
    await expect(recolher).toBeVisible();
    await expect(recolher).toContainText("Recolher menu");

    const dentroDaNav = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Navegação principal"]')!;
      const botao = [...document.querySelectorAll("button")].find(
        (item) => item.getAttribute("aria-label") === "Recolher sidebar",
      );
      const config = document.querySelector('a[aria-label="Configurações"]')!;
      return { botao: nav.contains(botao!), configuracoes: nav.contains(config) };
    });
    expect(dentroDaNav, "o rodapé fixo não pode depender de scroll para aparecer").toEqual({
      botao: false,
      configuracoes: false,
    });
  });

  test("mede a dobra e amarra o rodapé fixo à evidência visual", async ({ page }) => {
    await loginAdmin(page);
    await capturarRodapeFixo(page, 1280);
    await capturarRodapeFixo(page, 1366);
  });

  test("um agent não vê as portas administrativas acima de seu papel", async ({ page }) => {
    await login(page, creds.users.agent!.email);

    await expect(sidebar(page).getByRole("link", { name: "Instâncias WhatsApp" })).toHaveCount(0);
    await expect(sidebar(page).getByRole("link", { name: "Plano e pagamentos" })).toHaveCount(0);
    await expect(sidebar(page).getByRole("link", { name: "Usuários e permissões" })).toBeVisible();
    await expect(sidebar(page).getByRole("link", { name: "Conversas" })).toBeVisible();
  });
});
