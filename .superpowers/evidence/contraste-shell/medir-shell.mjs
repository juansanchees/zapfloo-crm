// Prova adicional: componente real, CSS compilado, login local e alpha composto.
// Não altera as specs existentes. Voltar /60 para /40 deve reprovar o h2.
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const phase = process.argv[2];
assert.match(phase ?? '', /^[a-z-]+$/);
const base = 'http://localhost:3220';
const creds = JSON.parse(readFileSync('.e2e-creds.json', 'utf8'));
const occupied = await fetch(`${base}/login`).then(() => true, () => false);
assert.equal(occupied, false, 'Porta ocupada: não reutilizar servidor de outra sessão');
const log = openSync(`.superpowers/evidence/contraste-shell/${phase}-server.log`, 'w');
const server = spawn(process.execPath, ['--env-file=.env.e2e', 'node_modules/next/dist/bin/next', 'start', '--port', '3220'], { stdio: ['ignore', log, log] });
const browser = await chromium.launch();
const rows = [];
try {
  const deadline = Date.now() + 60_000;
  while (!await fetch(`${base}/login`).then(r => r.ok, () => false)) {
    assert.ok(Date.now() < deadline && server.exitCode === null, 'Servidor local não iniciou');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${base}/login`);
  await page.locator('#email').fill(creds.users.agent.email);
  await page.locator('#password').fill(creds.password);
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForURL(/\/app\//);
  for (const footer of ['installed', 'update']) {
    // Só a resposta de versão é controlada para alcançar o ramo de aviso.
    // Login, layout e CSS continuam reais; isto não prova atualização do servidor.
    if (footer === 'update') await page.route('**/api/v1/system/version', route => route.fulfill({ json: { data: { current_version: '1.0.0', latest_version: '1.0.1', is_owner: true, update_available: true } } }));
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => localStorage.setItem('deskcomm-theme', theme), theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${base}/app/inbox`);
      await page.locator('aside h2').first().waitFor({ state: 'attached' });
      assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
      if (width === 390) await page.getByRole('button', { name: 'Abrir navegação', exact: true }).click();
      const root = width === 390 ? page.getByRole('dialog') : page.locator('aside.bg-shell');
      await root.locator(footer === 'installed' ? 'p[title^="Versão"]' : 'a[title^="Nova versão"]').waitFor();
      // Aguarda a transição da gaveta: opacidade/posição temporária não é o estado final.
      await root.evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished.catch(() => {}))); });
      const measured = await root.evaluate(root => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const rgba = css => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); const p = [...ctx.getImageData(0, 0, 1, 1).data]; return [p[0], p[1], p[2], p[3] / 255]; };
        const over = (fg, bg) => [0, 1, 2].map(i => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
        const luminance = rgb => rgb.map(v => { const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }).reduce((v, c, i) => v + c * [.2126, .7152, .0722][i], 0);
        return [...root.querySelectorAll('h2, p[title^="Versão"], span')].filter(el => {
          const r = el.getBoundingClientRect(); return r.width && r.height && !el.children.length && el.textContent.trim() && !el.closest('[aria-hidden="true"]') && !el.matches('.sr-only');
        }).map(el => {
          const ancestors = []; for (let n = el; n; n = n.parentElement) ancestors.unshift(n);
          let background = [255, 255, 255];
          for (const n of ancestors) background = over(rgba(getComputedStyle(n).backgroundColor), background);
          const style = getComputedStyle(el); const foreground = over(rgba(style.color), background);
          const a = luminance(foreground), b = luminance(background);
          const r = el.getBoundingClientRect();
          return { tag: el.tagName, text: el.textContent.trim(), className: el.className, cssColor: style.color, background, foreground, ratio: (Math.max(a,b)+.05)/(Math.min(a,b)+.05), fontSize: style.fontSize, width: r.width, height: r.height };
        });
      });
      rows.push({ footer, theme, width, measured });
      await root.screenshot({ path: `.superpowers/evidence/contraste-shell/${phase}-${footer}-${theme}-${width}.png` });
      if (width === 390) await page.keyboard.press('Escape');
    }
  }
  }
} finally { await browser.close(); server.kill('SIGTERM'); closeSync(log); }
writeFileSync(`.superpowers/evidence/contraste-shell/${phase}-medidas.json`, JSON.stringify(rows, null, 2));
const failed = rows.flatMap(row => row.measured.filter(m => m.ratio < 4.5).map(m => ({ footer: row.footer, theme: row.theme, width: row.width, ...m })));
console.log(JSON.stringify({ phase, states: rows.length, failed }, null, 2));
assert.equal(failed.length, 0, 'Texto da shell abaixo de 4.5:1');
