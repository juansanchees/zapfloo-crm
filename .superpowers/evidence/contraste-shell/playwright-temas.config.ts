// Harness adicional. As specs e a configuração canônica ficam intactas.
import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import base from '../../../playwright.config';

export default defineConfig({
  ...base,
  testDir: resolve(process.cwd(), 'tests/e2e'),
  outputDir: resolve(process.cwd(), '.superpowers/evidence/contraste-shell/runtime-results'),
  projects: ['light', 'dark'].map(colorScheme => ({
    name: `chromium-${colorScheme}`,
    use: { browserName: 'chromium' as const, colorScheme: colorScheme as 'light' | 'dark' },
  })),
});
