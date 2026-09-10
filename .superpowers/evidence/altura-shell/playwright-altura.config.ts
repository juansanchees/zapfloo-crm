import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import base from '../../../playwright.config';

export default defineConfig({
  ...base,
  testDir: resolve(process.cwd(), 'tests/e2e'),
  outputDir: resolve(process.cwd(), '.superpowers/evidence/altura-shell/runtime-results'),
  use: {
    ...base.use,
    viewport: { width: Number(process.env.ALTURA_WIDTH ?? '1280'), height: 720 },
    // Opt-in para a rodada adversarial: só encurta a espera por cliques
    // impossíveis, sem remover/rebaixar nenhuma asserção das specs.
    ...(process.env.ALTURA_ACTION_TIMEOUT ? { actionTimeout: Number(process.env.ALTURA_ACTION_TIMEOUT) } : {}),
  },
});
