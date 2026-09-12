import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const ALTURA = 720;
const LARGURAS = [1280, 390] as const;

type ResultadoSupabase = { error: { message: string } | null };
const conferir = (resultado: ResultadoSupabase) => {
  if (resultado.error) throw new Error(resultado.error.message);
};

async function anexar(testInfo: TestInfo, nome: string, body: unknown) {
  const path = testInfo.outputPath(nome);
  await writeFile(path, JSON.stringify(body, null, 2), "utf8");
  await testInfo.attach(nome, {
    path,
    contentType: "application/json",
  });
}

async function anexarScreenshot(page: Page, testInfo: TestInfo, nome: string) {
  const path = testInfo.outputPath(nome);
  await page.screenshot({ path });
  await testInfo.attach(nome, { path, contentType: "image/png" });
}

async function entrar(page: Page, email: string, senha: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(senha);
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page).toHaveURL(/\/onboarding\//);
  await page.getByRole("button", { name: "Explorar o CRM", exact: true }).first().click();
  await expect(page).toHaveURL(/\/app(\/|$)/);
}

async function medirEditor(page: Page) {
  return page.evaluate(() => {
    const medir = (elemento: Element | null) => {
      if (!elemento) return null;
      const r = elemento.getBoundingClientRect();
      const s = getComputedStyle(elemento);
      const vw = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
      const vh = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
      return {
        tag: elemento.tagName.toLowerCase(), testid: elemento.getAttribute("data-testid"),
        classes: elemento.getAttribute("class"), x: r.x, y: r.y, width: r.width, height: r.height,
        area: r.width * r.height, visibleArea: vw * vh, cssHeight: s.height,
        minHeight: s.minHeight, overflowY: s.overflowY, flexShrink: s.flexShrink,
        clientHeight: (elemento as HTMLElement).clientHeight,
        scrollHeight: (elemento as HTMLElement).scrollHeight,
        scrollTop: (elemento as HTMLElement).scrollTop,
      };
    };
    const main = document.querySelector("main");
    const canvas = document.querySelector('[data-testid="flow-canvas"]');
    const node = canvas?.querySelector('.react-flow__node[data-id="start"]') ?? null;
    const cb = canvas?.getBoundingClientRect();
    const nb = node?.getBoundingClientRect();
    const ancestors = [];
    for (let el: Element | null = canvas; el; el = el.parentElement) {
      ancestors.push(medir(el));
      if (el === main) break;
    }
    return {
      viewport: { width: innerWidth, height: innerHeight }, main: medir(main),
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      shell: medir(main?.querySelector(":scope > .min-h-full") ?? null),
      builder: medir(document.querySelector('[data-testid="flow-builder-shell"]')),
      publishBar: medir(document.querySelector('[data-testid="trigger-config-button"]')?.parentElement?.parentElement ?? null),
      triggerButton: medir(document.querySelector('[data-testid="trigger-config-button"]')),
      canvasRow: medir(canvas?.parentElement ?? null), canvas: medir(canvas),
      reactFlow: medir(canvas?.querySelector(".react-flow") ?? null),
      pane: medir(canvas?.querySelector(".react-flow__pane") ?? null), node: medir(node),
      zoom: medir(canvas?.querySelector(".react-flow__controls-zoomout") ?? null),
      nodeInsideCanvas: Boolean(cb && nb && nb.left >= cb.left && nb.right <= cb.right && nb.top >= cb.top && nb.bottom <= cb.bottom),
      ancestors,
    };
  });
}

async function rolarMainComWheel(page: Page, destino: "inicio" | "fim") {
  const main = page.locator("main");
  const box = await main.boundingBox();
  if (!box) throw new Error("main sem bounding box para gesto de wheel");
  const point = { x: box.x + 8, y: box.y + box.height / 2 };
  const lerScroll = () => main.evaluate((elemento) => ({
    clientHeight: elemento.clientHeight,
    scrollHeight: elemento.scrollHeight,
    scrollTop: elemento.scrollTop,
  }));
  const pointHit = await main.evaluate((elemento, p) => {
    const hit = document.elementFromPoint(p.x, p.y);
    return {
      tag: hit?.tagName.toLowerCase() ?? null,
      testid: hit?.getAttribute("data-testid") ?? null,
      classes: hit?.getAttribute("class") ?? null,
      insideMain: Boolean(hit && (hit === elemento || elemento.contains(hit))),
      overCanvas: Boolean(hit?.closest('[data-testid="flow-canvas"]')),
    };
  }, point);
  const before = await lerScroll();
  const maxScroll = Math.max(0, before.scrollHeight - before.clientHeight);
  const needed = destino === "fim" ? before.scrollTop < maxScroll : before.scrollTop > 0;
  const deltaY = needed ? (destino === "fim" ? before.scrollHeight : -before.scrollHeight) : 0;
  if (needed) {
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, deltaY);
    await expect.poll(async () => {
      const atual = await lerScroll();
      return destino === "fim" ? atual.scrollTop >= maxScroll - 1 : atual.scrollTop <= 1;
    }, { timeout: 5_000 }).toBe(true);
  }
  const after = await lerScroll();
  const reached = destino === "fim" ? after.scrollTop >= maxScroll - 1 : after.scrollTop <= 1;
  return {
    gesture: "mouse-wheel", destino, deltaY, point, pointHit,
    safePoint: pointHit.insideMain && !pointHit.overCanvas,
    needed, reached, before, after,
  };
}

async function testarZoom(page: Page) {
  const zoom = page.locator(".react-flow__controls-zoomout");
  let box = await zoom.boundingBox();
  if (!box || box.width <= 0 || box.height <= 0) {
    return { attempted: false, hit: false, changed: false, box, scrollGesture: null, error: "controle sem area" };
  }
  let hit = false;
  let scrollGesture: Awaited<ReturnType<typeof rolarMainComWheel>> | null = null;
  try {
    scrollGesture = await rolarMainComWheel(page, "fim");
    box = await zoom.boundingBox();
    if (!box || box.width <= 0 || box.height <= 0) {
      return { attempted: false, hit: false, changed: false, box, scrollGesture, error: "controle sem area apos scroll" };
    }
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    hit = await page.evaluate(({ x, y }) => Boolean(
      document.elementFromPoint(x, y)?.closest(".react-flow__controls-zoomout"),
    ), point);
    const viewport = page.locator(".react-flow__viewport");
    const before = await viewport.getAttribute("style");
    const escala = () => viewport.evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).a);
    const scaleBefore = await escala();
    if (hit) {
      await zoom.click({ timeout: 5_000 });
      await expect.poll(escala, { timeout: 5_000 }).toBeLessThan(scaleBefore);
    }
    const after = await viewport.getAttribute("style");
    const scaleAfter = await escala();
    return {
      attempted: true, hit, changed: hit && scaleAfter < scaleBefore,
      box, before, after, scaleBefore, scaleAfter, scrollGesture,
    };
  } catch (error) {
    return {
      attempted: true, hit, changed: false, box, scrollGesture,
      error: error instanceof Error ? error.message.split("\n")[0] : "erro",
    };
  }
}

async function testarAcessoAoGatilho(page: Page) {
  const button = page.getByTestId("trigger-config-button");
  const panel = page.getByTestId("trigger-config-panel");
  const medir = () => button.evaluate((elemento) => {
    const r = elemento.getBoundingClientRect();
    const main = elemento.closest("main");
    const centro = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    return {
      box: { x: r.x, y: r.y, width: r.width, height: r.height },
      hit: Boolean(document.elementFromPoint(centro.x, centro.y)?.closest('[data-testid="trigger-config-button"]')),
      main: main ? { clientHeight: main.clientHeight, scrollHeight: main.scrollHeight, scrollTop: main.scrollTop } : null,
    };
  });
  let before: Awaited<ReturnType<typeof medir>> | null = null;
  let afterScroll: Awaited<ReturnType<typeof medir>> | null = null;
  let afterOpen: Awaited<ReturnType<typeof medir>> | null = null;
  let clicked = false;
  let opened = false;
  let closed = false;
  let scrollGesture: Awaited<ReturnType<typeof rolarMainComWheel>> | null = null;
  try {
    before = await medir();
    scrollGesture = await rolarMainComWheel(page, "inicio");
    afterScroll = await medir();
    if (!afterScroll.hit) {
      return { before, afterScroll, afterOpen, clicked, opened, closed, scrollGesture, error: "gatilho sem hit-test" };
    }
    await button.click({ timeout: 5_000 });
    clicked = true;
    await expect(panel).toBeVisible({ timeout: 5_000 });
    opened = true;
    afterOpen = await medir();
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden({ timeout: 5_000 });
    closed = true;
    return { before, afterScroll, afterOpen, clicked, opened, closed, scrollGesture, error: null };
  } catch (error) {
    return {
      before, afterScroll, afterOpen, clicked, opened, closed, scrollGesture,
      error: error instanceof Error ? error.message.split("\n")[0] : "erro",
    };
  }
}

async function estabilizarEditor(page: Page, tentar: boolean) {
  if (!tentar) return { attempted: false, ready: false, error: "canvas sem area" };
  try {
    await page.locator('.react-flow__node[data-id="start"]').waitFor({ state: "attached", timeout: 5_000 });
    await page.locator(".react-flow__controls").waitFor({ state: "attached", timeout: 5_000 });
    let ultimoTransform: string | null = null;
    let leiturasEstaveis = 0;
    await expect.poll(async () => {
      const medidas = await medirEditor(page);
      const controls = await page.locator(".react-flow__controls").boundingBox();
      const transform = await page.locator(".react-flow__viewport").getAttribute("style");
      leiturasEstaveis = transform === ultimoTransform ? leiturasEstaveis + 1 : 0;
      ultimoTransform = transform;
      return Boolean(medidas.nodeInsideCanvas && controls?.width && controls.height && transform?.includes("transform") && leiturasEstaveis >= 2);
    }, { timeout: 5_000 }).toBe(true);
    return { attempted: true, ready: true, error: null };
  } catch (error) {
    return { attempted: true, ready: false, error: error instanceof Error ? error.message.split("\n")[0] : "erro" };
  }
}

async function medirSobreposicaoMobile(page: Page) {
  const add = await page.getByRole("button", { name: "Adicionar nó", exact: true }).boundingBox();
  const controls = await page.locator(".react-flow__controls").boundingBox();
  const overlap = Boolean(add && controls && add.x < controls.x + controls.width && add.x + add.width > controls.x
    && add.y < controls.y + controls.height && add.y + add.height > controls.y);
  return { add, controls, overlap };
}

async function medirAgenda(page: Page) {
  return page.evaluate(() => {
    const medir = (elemento: Element | null) => {
      if (!elemento) return null;
      const r = elemento.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, area: r.width * r.height };
    };
    const grade = document.querySelector('[data-testid="grade-da-agenda"]');
    return {
      viewport: { width: innerWidth, height: innerHeight },
      tela: medir(document.querySelector('[data-testid="tela-agenda"]')),
      grade: medir(grade), gradeBody: medir(grade?.lastElementChild ?? null),
      historico: medir(document.querySelector('[data-testid="historico-da-agenda"]')),
    };
  });
}

async function medirEstimuloDeLayout(page: Page) {
  return page.evaluate(() => {
    const rect = (elemento: Element | null) => {
      if (!elemento) return null;
      const r = elemento.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    };
    const main = document.querySelector("main");
    const workspace = document.querySelector('[data-testid="flow-builder-shell"]') as HTMLElement | null;
    const stimulus = document.querySelector('[data-testid="synthetic-layout-stimulus"]');
    const mainRect = main?.getBoundingClientRect();
    const workspaceRect = workspace?.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      stimulus: { kind: "synthetic-layout-only", businessEvent: false, box: rect(stimulus) },
      main: main && mainRect ? {
        top: mainRect.top, bottom: mainRect.bottom, clientHeight: main.clientHeight,
        scrollHeight: main.scrollHeight, scrollTop: main.scrollTop,
      } : null,
      workspace: { box: rect(workspace), inlineHeight: workspace?.style.height ?? null },
      canvasRow: rect(document.querySelector('[data-testid="flow-canvas"]')?.parentElement ?? null),
      canvas: rect(document.querySelector('[data-testid="flow-canvas"]')),
      bottomDelta: mainRect && workspaceRect ? Math.abs(workspaceRect.bottom - mainRect.bottom) : null,
    };
  });
}

async function provarRefluxoDoWorkspace(page: Page, testInfo: TestInfo) {
  const report: Record<string, unknown> = {
    stimulus: "synthetic-layout-only",
    businessEvent: false,
  };
  const aligned = async (label: string) => {
    await expect.soft.poll(async () => (await medirEstimuloDeLayout(page)).bottomDelta ?? Number.POSITIVE_INFINITY, {
      message: `${label}: workspace acompanha o fundo do main`, timeout: 5_000,
    }).toBeLessThanOrEqual(2);
    report[label] = await medirEstimuloDeLayout(page);
  };
  const setStimulusHeight = (height: number) => page.evaluate((value) => {
    const main = document.querySelector("main");
    const workspace = main?.querySelector('[data-testid="flow-builder-shell"]');
    const wrapper = workspace && Array.from(main?.children ?? []).find(child => child.contains(workspace));
    if (!main || !wrapper) throw new Error("estrutura do main indisponivel para estimulo sintetico");
    let stimulus = main.querySelector('[data-testid="synthetic-layout-stimulus"]') as HTMLElement | null;
    if (!stimulus) {
      stimulus = document.createElement("div");
      stimulus.dataset.testid = "synthetic-layout-stimulus";
      stimulus.setAttribute("aria-hidden", "true");
      stimulus.style.flexShrink = "0";
      main.insertBefore(stimulus, wrapper);
    }
    stimulus.style.height = `${value}px`;
  }, height);

  try {
    await page.setViewportSize({ width: 1280, height: 1200 });
    await aligned("alto-1280");
    await page.setViewportSize({ width: 767, height: 1200 });
    await aligned("breakpoint-767");
    await page.setViewportSize({ width: 768, height: 1200 });
    await aligned("breakpoint-768");
    await page.setViewportSize({ width: 1280, height: 1200 });
    await aligned("alto-restaurado");

    // Estimulo vazio e exclusivamente geométrico; não representa aviso/evento de negócio.
    await setStimulusHeight(180);
    await aligned("estimulo-180");
    await setStimulusHeight(240);
    await aligned("estimulo-240");
    await page.locator('[data-testid="synthetic-layout-stimulus"]').evaluate((elemento) => elemento.remove());
    await aligned("estimulo-removido");
  } finally {
    await page.locator('[data-testid="synthetic-layout-stimulus"]').evaluateAll((elementos) => elementos.forEach((e) => e.remove()));
    await page.setViewportSize({ width: 1280, height: ALTURA });
    await anexar(testInfo, "editor-estimulo-sintetico-1280.json", report);
  }
}

for (const largura of LARGURAS) {
  test(`${largura}x${ALTURA}: o canvas aceita zoom e a Agenda conserva altura`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: largura, height: ALTURA });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRole) throw new Error("Fixture exige Supabase local configurado no runner");
    if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Fixture exige banco local");
    const db = createClient(url, serviceRole, { auth: { persistSession: false } });
    const org = randomUUID(), flow = randomUUID();
    const email = `altura-${largura}-${randomUUID()}@example.test`, senha = "SomenteFixtureLocal-2026!";
    let userId: string | undefined;

    try {
      const user = await db.auth.admin.createUser({ email, password: senha, email_confirm: true });
      conferir(user);
      userId = user.data.user?.id;
      if (!userId) throw new Error("Fixture sem id de usuario");
      conferir(await db.from("organizations").insert({
        id: org, slug: org, display_name: "Empresa QA Altura", legal_name: "Empresa QA Altura", created_by: userId,
      }));
      conferir(await db.from("user_organizations").insert({
        user_id: userId, organization_id: org, role: "admin", accepted_at: new Date().toISOString(),
      }));
      conferir(await db.from("followup_flow_pointers").insert({
        id: flow, organization_id: org, name: "Fluxo QA Altura",
        draft_graph: {
          nodes: [{ id: "start", type: "trigger", label: "Inicio", config: {}, position: { x: 0, y: 0 } }], edges: [],
        },
      }));

      await entrar(page, email, senha);
      await page.goto(`/app/ai/followups/${flow}`);
      await expect(page.getByTestId("flow-builder-shell")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("flow-canvas").waitFor({ state: "attached", timeout: 30_000 });
      await page.locator(".react-flow").waitFor({ state: "attached", timeout: 30_000 });

      // A coleta termina antes das assercoes suaves, para a mesma sessao ainda medir a Agenda.
      const initial = await medirEditor(page);
      const readiness = await estabilizarEditor(page, (initial.canvas?.area ?? 0) > 0);
      const before = await medirEditor(page);
      const zoom = (before.canvas?.area ?? 0) > 0 && (before.zoom?.area ?? 0) > 0
        ? await testarZoom(page)
        : { attempted: false, hit: false, changed: false, scrollGesture: null, error: "canvas ou controle sem area" };
      const mobile = largura === 390 ? await medirSobreposicaoMobile(page) : null;
      const afterZoom = await medirEditor(page);
      const trigger = await testarAcessoAoGatilho(page);
      const afterTrigger = await medirEditor(page);
      await anexar(testInfo, `editor-${largura}x${ALTURA}.json`, {
        initial, readiness, before, zoom, mobile, afterZoom, trigger, afterTrigger,
      });
      await anexarScreenshot(page, testInfo, `editor-${largura}x${ALTURA}.png`);

      expect.soft(before.canvas?.area ?? 0, "canvas com area positiva").toBeGreaterThan(0);
      expect.soft(before.reactFlow?.area ?? 0, "React Flow com area positiva").toBeGreaterThan(0);
      expect.soft(before.pane?.visibleArea ?? 0, "pane visivel na viewport").toBeGreaterThan(0);
      expect.soft(before.nodeInsideCanvas, "no real contido no canvas").toBe(true);
      expect.soft(zoom.scrollGesture?.safePoint, "wheel do zoom parte do padding do main").toBe(true);
      expect.soft(zoom.scrollGesture?.reached, "wheel real alcanca o fim do main").toBe(true);
      expect.soft(zoom.hit, "centro do zoom recebe hit-test").toBe(true);
      expect.soft(zoom.changed, "zoom muda o transform real").toBe(true);
      expect.soft(trigger.scrollGesture?.safePoint, "wheel do gatilho parte do padding do main").toBe(true);
      expect.soft(trigger.scrollGesture?.reached, "wheel real retorna ao inicio do main").toBe(true);
      expect.soft(trigger.afterScroll?.hit, "gatilho recebe hit-test apos rolar o main").toBe(true);
      expect.soft(trigger.clicked, "gatilho aceita clique real depois do zoom").toBe(true);
      expect.soft(trigger.opened, "painel do gatilho abre").toBe(true);
      expect.soft(trigger.closed, "painel do gatilho fecha com Escape").toBe(true);
      expect.soft(afterTrigger.horizontalOverflow, "pagina sem overflow horizontal").toBe(0);
      if (mobile) {
        expect.soft((mobile.add?.width ?? 0) * (mobile.add?.height ?? 0), "Adicionar no tem area").toBeGreaterThan(0);
        expect.soft((mobile.controls?.width ?? 0) * (mobile.controls?.height ?? 0), "controles tem area").toBeGreaterThan(0);
        expect.soft(mobile.overlap, "Adicionar no e controles nao se sobrepoem").toBe(false);
      }

      if (largura === 1280) await provarRefluxoDoWorkspace(page, testInfo);

      await page.goto("/app/agenda");
      await expect(page.getByRole("heading", { name: "Agenda", exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("tela-agenda")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("grade-da-agenda").waitFor({ state: "attached", timeout: 30_000 });
      await page.getByTestId("historico-da-agenda").waitFor({ state: "attached", timeout: 30_000 });
      const agenda = await medirAgenda(page);
      await anexar(testInfo, `agenda-${largura}x${ALTURA}.json`, agenda);
      await anexarScreenshot(page, testInfo, `agenda-${largura}x${ALTURA}.png`);
      expect.soft(agenda.gradeBody?.height ?? 0, "ultimo filho da grade com altura").toBeGreaterThan(0);
      expect.soft(agenda.historico?.height ?? 0, "historico com altura").toBeGreaterThan(0);
    } finally {
      conferir(await db.from("followup_flow_pointers").delete().eq("id", flow).eq("organization_id", org));
      conferir(await db.from("user_organizations").delete().eq("organization_id", org));
      conferir(await db.from("organizations").delete().eq("id", org));
      if (userId) conferir(await db.auth.admin.deleteUser(userId));
    }
  });
}
