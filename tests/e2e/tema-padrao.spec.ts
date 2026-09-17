import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";

type Amostra = { instante: number; tema: string | null; fundo: string | null };
declare global {
  interface Window {
    __provaTema: { mudancas: Amostra[]; quadros: Amostra[] };
  }
}

const evidencia = path.join(process.cwd(), ".superpowers/evidence/tema-padrao");

async function observarPintura(page: Page) {
  // Observa desde antes do script do produto, sem aplicar tema pela sonda.
  await page.addInitScript(() => {
    const prova = window.__provaTema = { mudancas: [] as Amostra[], quadros: [] as Amostra[] };
    const amostra = (): Amostra => ({
      instante: performance.now(),
      tema: document.documentElement?.getAttribute("data-theme") ?? null,
      fundo: document.body ? getComputedStyle(document.body).backgroundColor : null,
    });
    new MutationObserver(() => prova.mudancas.push(amostra())).observe(document, {
      subtree: true, childList: true, attributes: true, attributeFilter: ["data-theme"],
    });
    const quadro = () => {
      if (document.body?.children.length) prova.quadros.push(amostra());
      requestAnimationFrame(quadro);
    };
    requestAnimationFrame(quadro);
  });
}

async function provarSemPisca(page: Page, esperado: "light" | "dark", nome: string) {
  await expect.poll(() => page.evaluate(() => ({
    pinturas: performance.getEntriesByType("paint").length,
    quadros: window.__provaTema.quadros.length,
  }))).toMatchObject({ pinturas: 2 });
  await expect.poll(() => page.evaluate(() => window.__provaTema.quadros.length)).toBeGreaterThan(3);
  const prova = await page.evaluate(() => ({
    ...window.__provaTema,
    pinturas: performance.getEntriesByType("paint").map(p => ({ nome: p.name, instante: p.startTime })),
    tema: document.documentElement.getAttribute("data-theme"),
    fundo: getComputedStyle(document.body).backgroundColor,
  }));
  const primeiraPintura = prova.pinturas.find(p => p.nome === "first-paint")!.instante;
  const antes = prova.mudancas.filter(m => m.instante <= primeiraPintura).at(-1);
  expect(antes, "tema definido antes da primeira pintura").toBeDefined();
  expect(antes!.tema).toBe(esperado);
  expect(prova.tema).toBe(esperado);
  expect(prova.quadros.length).toBeGreaterThan(0);
  expect([...new Set(prova.quadros.map(q => q.tema))]).toEqual([esperado]);
  expect([...new Set(prova.quadros.map(q => q.fundo))]).toEqual([prova.fundo]);
  mkdirSync(evidencia, { recursive: true });
  const caminhoPng = path.join(evidencia, `${nome}.png`);
  const captura = await page.screenshot();
  writeFileSync(caminhoPng, captura);
  // A prova anterior teve o PNG sobrescrito dois minutos depois do JSON. O
  // digest torna essa divergência verificável, em vez de confiar só no nome.
  const sha256 = createHash("sha256").update(captura).digest("hex");
  const provaVinculada = {
    ...prova,
    captura: { arquivo: path.basename(caminhoPng), sha256 },
  };
  expect(
    provaVinculada.captura.sha256,
    "o JSON precisa identificar exatamente o PNG produzido pela mesma medicao",
  ).toMatch(/^[a-f0-9]{64}$/);
  expect(createHash("sha256").update(readFileSync(caminhoPng)).digest("hex")).toBe(sha256);
  const json = JSON.stringify(provaVinculada, null, 2);
  writeFileSync(path.join(evidencia, `${nome}.json`), json);
  await test.info().attach(`${nome}-pintura`, { body: json, contentType: "application/json" });
}

async function capturarTemaInterno(page: Page, tema: "light" | "dark") {
  await page.goto("/app/inbox");
  await expect(page).toHaveURL(/\/app\/inbox$/);
  await expect(page.locator("html")).toHaveAttribute("data-theme", tema);
  await expect(page.locator("main")).toBeVisible();

  const medida = await page.evaluate(() => {
    const main = document.querySelector("main");
    const sidebar = document.querySelector("aside");
    if (!main || !sidebar) throw new Error("shell interna incompleta");
    return {
      url: window.location.pathname,
      data_theme: document.documentElement.getAttribute("data-theme"),
      body_background_color: getComputedStyle(document.body).backgroundColor,
      main_background_color: getComputedStyle(main).backgroundColor,
      sidebar_background_color: getComputedStyle(sidebar).backgroundColor,
    };
  });

  expect(medida).toMatchObject({
    url: "/app/inbox",
    data_theme: tema,
    body_background_color: tema === "light" ? "rgb(247, 247, 251)" : "rgb(22, 24, 38)",
  });
  expect(medida.body_background_color).not.toBe("");

  mkdirSync(evidencia, { recursive: true });
  const caminhoPng = path.join(evidencia, `inbox-${tema}.png`);
  const captura = await page.screenshot();
  writeFileSync(caminhoPng, captura);
  // JSON e imagem identificam a mesma captura; trocar só um deles quebra a prova.
  const sha256 = createHash("sha256").update(captura).digest("hex");
  expect(createHash("sha256").update(readFileSync(caminhoPng)).digest("hex")).toBe(sha256);
  const json = JSON.stringify({ ...medida, captura: { arquivo: path.basename(caminhoPng), sha256 } }, null, 2);
  writeFileSync(path.join(evidencia, `inbox-${tema}.json`), json);
  await test.info().attach(`inbox-${tema}`, { body: json, contentType: "application/json" });
}

async function provarSidebarEscura(page: Page, tema: "light" | "dark") {
  const medida = await page.locator("aside").first().evaluate(el => {
    const style = getComputedStyle(el);
    const luminancia = (cor: string) => {
      const rgb = cor.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => {
        const s = v / 255;
        return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
      });
      return rgb[0]! * .2126 + rgb[1]! * .7152 + rgb[2]! * .0722;
    };
    const fundo = luminancia(style.backgroundColor), texto = luminancia(style.color);
    return { cor: style.backgroundColor, fundo, texto, contraste: (texto + .05) / (fundo + .05) };
  });
  // Os tokens existentes têm dois tons escuros diferentes. Preservamos ambos:
  // fundo mais escuro que o texto claro e contraste AA, não igualdade de RGB.
  expect(medida.texto).toBeGreaterThan(medida.fundo);
  expect(medida.contraste).toBeGreaterThanOrEqual(4.5);
  mkdirSync(evidencia, { recursive: true });
  writeFileSync(path.join(evidencia, `sidebar-${tema}.json`), JSON.stringify(medida, null, 2));
}

test.describe("padrão claro e preferências preservadas", () => {
  test.use({ colorScheme: "dark", viewport: { width: 1280, height: 720 } });

  for (const [salvo, esperado] of [[null, "light"], ["dark", "dark"], ["light", "light"], ["system", "dark"]] as const) {
    test(`primeira pintura: preferência ${salvo ?? "ausente"}, SO escuro → ${esperado}`, async ({ page }) => {
      await observarPintura(page);
      if (salvo) await page.addInitScript(valor => localStorage.setItem("deskcomm-theme", valor), salvo);
      await page.goto("/login");
      await expect(page.locator("#email")).toBeVisible();
      await provarSemPisca(page, esperado, `inicio-${salvo ?? "novo"}`);
      expect(await page.evaluate(() => localStorage.getItem("deskcomm-theme"))).toBe(salvo);
    });
  }

  test("tema é aplicado mesmo antes de carregar o JavaScript de hidratação", async ({ page }) => {
    await observarPintura(page);
    await page.addInitScript(() => localStorage.setItem("deskcomm-theme", "dark"));
    await page.route(/\/_next\/static\/.*\.js(?:\?.*)?$/, route => route.abort());
    await page.goto("/login");
    await expect(page.locator("#email")).toBeVisible();
    await provarSemPisca(page, "dark", "antes-da-hidratacao");
  });

  test("escolha na tela, reload, limpeza e sistema mantêm o contrato", async ({ page }) => {
    test.setTimeout(120_000);
    await observarPintura(page);
    await loginComoAdmin(page, lerCreds());
    const tema = page.getByRole("button", { name: /^Tema:/ });
    await expect(tema).toHaveAttribute("aria-label", /Tema: light\./);
    await provarSidebarEscura(page, "light");
    await tema.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(tema).toHaveAttribute("aria-label", /Tema: dark\./);
    await provarSemPisca(page, "dark", "escuro-apos-reload");
    await capturarTemaInterno(page, "dark");
    await provarSidebarEscura(page, "dark");

    // Sabotagem de entrada pedida: dark salvo vence; apagar a escolha volta ao claro.
    await page.evaluate(() => localStorage.setItem("deskcomm-theme", "dark"));
    await page.reload();
    await expect(tema).toHaveAttribute("aria-label", /Tema: dark\./);
    await page.evaluate(() => localStorage.removeItem("deskcomm-theme"));
    await page.reload();
    await expect(tema).toHaveAttribute("aria-label", /Tema: light\./);
    await provarSemPisca(page, "light", "claro-apos-limpar");
    await capturarTemaInterno(page, "light");
    expect(await page.evaluate(() => localStorage.getItem("deskcomm-theme"))).toBeNull();

    await tema.click(); // light → dark
    await tema.click(); // dark → system, a terceira opção continua disponível
    await expect(tema).toHaveAttribute("aria-label", /Tema: system\./);
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(tema).toHaveAttribute("aria-label", /Tema: system\./);
    await provarSemPisca(page, "dark", "sistema-apos-reload");
    expect(await page.evaluate(() => localStorage.getItem("deskcomm-theme"))).toBe("system");
  });
});
