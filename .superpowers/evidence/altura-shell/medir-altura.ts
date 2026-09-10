// Sonda do layout real: login local, CSS de produção e geometria, sem API simulada.
// A hipótese no DOM é diagnóstica; a fase verde mede o build corrigido sem mutá-lo.
import { chromium } from '@playwright/test';
import { openSync, closeSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { lerCreds, loginComoAdmin } from '../../../tests/e2e/helpers/login-admin';

async function main() {
  const phase = process.argv[2];
  assert.match(phase ?? '', /^[a-z-]+$/);
  const port = process.env.ALTURA_PORT ?? '3222';
  const baseURL = `http://localhost:${port}`;
  assert.equal(await fetch(`${baseURL}/login`).then(() => true, () => false), false, 'Porta ocupada');
  const evidence = '.superpowers/evidence/altura-shell';
  const log = openSync(`${evidence}/${phase}-sonda-server.log`, 'w');
  const server = spawn(process.execPath, ['--env-file=.env.e2e', 'node_modules/next/dist/bin/next', 'start', '--port', port], { stdio: ['ignore', log, log] });
  const browser = await chromium.launch();
  const rows: unknown[] = [];
  const failures: string[] = [];
  try {
    const deadline = Date.now() + 60_000;
    while (!await fetch(`${baseURL}/login`).then(r => r.ok, () => false)) {
      assert.ok(Date.now() < deadline && server.exitCode === null, 'Servidor não iniciou');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    const page = await browser.newPage({ baseURL, viewport: { width: 1280, height: 720 } });
    await loginComoAdmin(page, lerCreds());
    const res = await page.request.get('/api/v1/pipelines');
    assert.ok(res.ok(), `Não carregou funis: ${res.status()}`);
    const payload = await res.json();
    const pipelines = Array.isArray(payload.data) ? payload.data : payload.data?.items;
    const pipeline = pipelines?.[0]?.id;
    assert.ok(pipeline, 'Fixture precisa de um funil real');
    const routes = ['/app/agenda', '/app/metrics', '/app/team', '/app/connections', '/app/settings/profile', '/app/settings/security', '/app/settings/tenant', '/app/settings/notifications', '/app/settings/billing', '/app/lgpd/requests', `/app/pipelines/${pipeline}`, '/app/inbox'];
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 720 });
      for (const route of routes) {
        await page.goto(route);
        await page.locator('main').waitFor();
        if (route === '/app/agenda') await page.getByTestId('tela-agenda').waitFor({ state: 'visible' });
        else if (route !== '/app/inbox') await page.locator('main h1').first().waitFor({ state: 'visible' });
        // Espera o conteúdo estabilizar por frames, sem confundir skeleton e caixa final.
        await page.waitForFunction(() => !document.querySelector('main [data-slot="skeleton"], main [data-testid="agenda-skeleton"]'));
        await page.waitForFunction(() => ![...document.querySelectorAll('main p, main div, main span')].some(el => el.children.length === 0 && /^Carregando/.test(el.textContent?.trim() ?? '')));
        if (route === '/app/metrics') await page.getByText('Performance por atendente', { exact: true }).waitFor();
        if (route === '/app/team') await page.locator('main table tbody tr').first().waitFor();
        if (route.startsWith('/app/pipelines/')) {
          const columns = page.locator('[data-rfd-droppable-id]');
          await columns.first().waitFor();
          assert.ok(await columns.count() > 1, 'O quadro real deve carregar suas etapas');
          const boxes = await columns.evaluateAll(els => els.map(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height })));
          assert.ok(boxes.every(box => box.width > 0 && box.height > 0), 'Área de drop colapsada');
        }
        await page.evaluate(async () => { await document.fonts.ready; await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
        // String deliberada: tsx injeta __name em funções aninhadas; esse helper
        // do transpiler não existe no realm do navegador.
        const measure = () => page.evaluate<{ gridBody: { height: number } | null; wrapper: { height: number } | null; contentHeight: number }>(`(() => {
          const main = document.querySelector('main');
          const rect = (el) => {
            const r = el.getBoundingClientRect(), s = getComputedStyle(el);
            return { tag: el.tagName, classes: el.getAttribute('class'), width: r.width, height: r.height, top: r.top, bottom: r.bottom, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight, overflowY: s.overflowY, flexShrink: s.flexShrink, minHeight: s.minHeight };
          };
          const root = [...main.querySelectorAll('.h-full')].find(el => !el.parentElement?.closest('main .h-full'));
          const grid = main.querySelector('[data-testid="grade-da-agenda"]');
          return { url: location.pathname, main: rect(main), contentHeight: main.clientHeight - parseFloat(getComputedStyle(main).paddingTop) - parseFloat(getComputedStyle(main).paddingBottom), root: root ? rect(root) : null, wrapper: root && root.parentElement !== main ? rect(root.parentElement) : null, children: root ? [...root.children].map(rect) : [], grid: grid ? rect(grid) : null, gridBody: grid?.lastElementChild ? rect(grid.lastElementChild) : null, documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, documentHeight: document.documentElement.scrollHeight, viewportHeight: innerHeight };
        })()`);
        const actual = await measure();
        rows.push({ width, route: route.replace(pipeline, '[id]'), variant: 'build', ...actual });
        // O caso curto guarda o piso separadamente: a Agenda longa não detecta
        // a retirada isolada do mínimo (o conteúdo já é maior que a viewport).
        if (route === '/app/settings/billing' && (!actual.wrapper || actual.wrapper.height < actual.contentHeight - 1)) failures.push(`Plano ${width}: contêiner curto não preenche a área principal`);
        if (route === '/app/agenda') {
          await page.screenshot({ path: `${evidence}/${phase}-agenda-${width}.png` });
          if (!actual.gridBody || actual.gridBody.height < 1) failures.push(`Agenda ${width}: área da grade sem altura`);
          else {
            await page.getByTestId('grade-da-agenda').scrollIntoViewIfNeeded();
            await page.screenshot({ path: `${evidence}/${phase}-grade-${width}.png` });
            const scroll = await page.evaluate(() => ({ main: document.querySelector('main')!.scrollTop, document: document.documentElement.scrollTop, sidebar: document.querySelector('aside.bg-shell')?.getBoundingClientRect().top }));
            assert.ok(scroll.main > 0 && scroll.document === 0, 'A Agenda deve rolar pelo main, não pelo documento');
            if (width === 1280) assert.equal(scroll.sidebar, 0, 'A sidebar saiu da viewport');
          }
        }
        if (phase === 'original' && route !== '/app/inbox') {
          await page.evaluate(() => {
            const main = document.querySelector('main')!;
            const root = [...main.children].find(el => el.classList.contains('h-full'));
            if (!root) throw new Error('Raiz h-full não encontrada para hipótese');
            const wrapper = document.createElement('div');
            wrapper.className = 'flex min-h-full flex-col';
            // A classe nova ainda não existe no CSS do build ORIGINAL.
            // Somente nesta hipótese reproduzimos sua declaração CSS explícita.
            wrapper.style.minHeight = '100%';
            wrapper.dataset.sondaAltura = 'true';
            root.before(wrapper); wrapper.append(root);
          });
          rows.push({ width, route: route.replace(pipeline, '[id]'), variant: 'hipotese-wrapper', ...await measure() });
          await page.locator('[data-sonda-altura]').evaluate(el => { el.classList.remove('min-h-full'); (el as HTMLElement).style.removeProperty('min-height'); });
          rows.push({ width, route: route.replace(pipeline, '[id]'), variant: 'hipotese-sem-min', ...await measure() });
        }
      }
    }
  } finally {
    await browser.close(); server.kill('SIGTERM'); closeSync(log);
    writeFileSync(`${evidence}/${phase}-medidas.json`, JSON.stringify(rows, null, 2));
  }
  process.stdout.write(JSON.stringify({ phase, states: rows.length, failures }, null, 2) + '\n');
  assert.deepEqual(failures, [], 'A shell não pode colapsar a grade');
}
void main();
