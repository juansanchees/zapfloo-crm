# Nocturne Shell Redesign Implementation Plan

> **For implementer:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Aplicar a casca visual Nocturne ao Zapfloo — paleta, animações, componentes base e menu — sem criar telas, funções, dependências ou mudanças de banco.

**Architecture:** Manter um único sistema: os tokens continuam em `app/globals.css`, os componentes continuam sendo os componentes shadcn de `components/ui`, e `lib/navigation/registry.ts` continua sendo a fonte canônica de todas as rotas. A sidebar muda somente a projeção compacta para três grupos; hubs, abas e busca seguem expondo os destinos secundários existentes.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Tailwind CSS 4 CSS-first, shadcn/Radix UI, Phosphor Icons, Vitest 4 e Playwright 1.

---

### Task 1: Aplicar a paleta traduzida, raios, sombras e animações

**Files:**
- Modify: `app/globals.css`
- Regenerate from test output: `lib/branding/regua-do-produto.ts`
- Test: `tests/unit/branding-regua-do-produto.test.ts`
- Test: `tests/unit/branding-contraste.test.ts`
- Test: `tests/unit/branding-tema-claro-escopavel.test.ts`

**Step 1: Capture the expected ruler failure**

Run the ruler test before updating the frozen module after the CSS values change. Preserve the failure output because it is the generator contract.

**Step 2: Replace token values only**

Copy the corresponding values from `design-zapfloo/nocturne/paleta-traduzida.css` into the existing `:root`, `[data-theme="light"]`, and `[data-theme="dark"]` blocks. Keep every existing token name and block location. Preserve the current `--space-*` scale and the default light-theme behavior. Use radii 4/8/14/18 and the translated shadows. No Nocturne hex may leave `app/globals.css`.

**Step 3: Add the four motion primitives**

Add `zfIn`, `zfToast`, `zfPulse`, and `zfSweep` with the exact supplied transforms and opacity values, nested under `@media (prefers-reduced-motion: no-preference)`.

**Step 4: Regenerate the frozen product ruler**

Run `tests/unit/branding-regua-do-produto.test.ts`, copy the object literal printed by its failure exactly into `lib/branding/regua-do-produto.ts`, and rerun it. Do not derive or edit any value independently.

**Step 5: Verify the palette contract**

Run the ruler, contrast, scoped-light-theme, token-count and branding tests by name. Confirm the light and dark blocks still cover the exact same required token set and contrast remains valid.

**Step 6: Commit and push the stage**

Commit the palette/ruler work with a named commit and push `codex/redesign-nocturne-casca` so the remote remains a live recovery point.

### Task 2A: Restyle the existing UI primitives

**Files:**
- Modify: `components/ui/button.tsx`
- Modify: `components/ui/card.tsx`
- Modify: `components/ui/input.tsx`
- Modify: `components/ui/textarea.tsx`
- Modify: `components/ui/select.tsx`
- Modify: `components/ui/badge.tsx`
- Modify: `components/ui/table.tsx`
- Modify: `components/ui/separator.tsx`
- Modify where necessary for icon consistency only: `components/ui/dialog.tsx`, `components/ui/dropdown-menu.tsx`, `components/ui/sheet.tsx`
- Test: existing component and branding tests selected by changed primitive

**Step 1: Lock behavior and public APIs**

Record the current variants and exports. Do not rename props, variants, exports, Radix parts or behavioral state.

**Step 2: Apply the outlined-button rule**

Make `primary` and `default` use a transparent background with a 1px accent border and accent text. Use 12% accent background on hover and 22% on active. Keep `secondary` on a divider border and `ghost` as accent text without a default fill. Preserve destructive semantics and all existing sizes.

**Step 3: Apply Nocturne surfaces and typography**

Use surface background and radius 8 for cards; title 17px at weight 500, muted metadata, and a reusable small uppercase accent kicker through the existing card API rather than a parallel component system. Set form controls to 36px desktop height, surface background, divider border, accent caret/focus border, and 45% disabled opacity. Style badges with accent-800 background and accent-100 text while preserving semantic variants.

**Step 4: Apply fading rules and table lines**

Use the Nocturne 48px edge fade for standalone separators and table row rules. Keep control borders and internal control separators solid.

**Step 5: Standardize focus and icons**

All keyboard focus indicators remain a 2px accent outline with 2px offset. Replace direct `lucide-react` use in touched UI primitives with the canonical Phosphor barrel in `lib/ui/icons.ts`, without adding a dependency.

**Step 6: Run focused tests and commit**

Run relevant unit tests for components, branding and accessibility. Commit only the component-owned files.

### Task 2B: Reorganize and restyle the menu

**Files:**
- Modify: `lib/navigation/registry.ts`
- Modify: `components/shell/Sidebar.tsx`
- Modify: `components/shell/SearchTrigger.tsx`
- Modify if required for the same shell projection: `components/shell/MobileSidebar.tsx`, `components/shell/TopBar.tsx`, `components/shell/AreaNavigation.tsx`
- Modify: `tests/unit/navegacao-registry.test.ts`
- Modify: `tests/unit/sidebar-grupos.test.tsx`
- Test: `tests/unit/navegacao-completude.test.ts`
- Test: `tests/e2e/navegacao.spec.ts`

**Step 1: Write the three-group compact-navigation expectations**

Update focused tests first to require, in order: OPERAÇÃO (`Painel de controle`, `Conversas`, `Funis de vendas`, `Contatos`, `Tarefas e agenda`), EQUIPE (`Relatórios`), and ADMINISTRAÇÃO (`Instâncias WhatsApp`, `Usuários e permissões`, `Plano e pagamentos`). Require `Funis de vendas` to point to `/app/kanban`, `Tarefas e agenda` to `/app/tasks`, and preserve `/app/agenda` as a contextual tab/route.

**Step 2: Change only the compact projection**

Extend the compact-section type to the three groups and update `COMPACT_AREA_SPECS`. Rename the canonical visible labels requested by the owner while keeping `NAV_DESTINATIONS`, hubs, tabs, permissions and searchable destinations intact. Add the requested comment that Chat interno, Metas and Suporte interno enter only when their real screens exist.

**Step 3: Render the shell structure**

Render all three section labels, the inbox queue pill from an existing real count source if one is already available to the shell, active left marker, fixed collapse footer, search with ⌘K, 0.22s width transition, 13.5px app-shell body density, accent-900-to-bg sidebar gradient and the specified thin scrollbar. Do not add mock data, XP, levels, streaks, role switching, challenges or rankings. If no existing real queue count is available without new behavior/API, render no fabricated count and document the limitation.

**Step 4: Preserve every secondary route**

Run `navegacao-completude` and registry tests. No route, destination, tab, hub or permission guard may be removed or weakened.

**Step 5: Run focused navigation E2E and commit**

Run the focused sidebar/navigation unit tests and `tests/e2e/navegacao.spec.ts` where the harness is available. Commit only the menu-owned files.

### Task 3: Reconcile translations, evidence, release note and full acceptance

**Files:**
- Modify: `lib/i18n/dicionario.ts`
- Add: `.changes/redesign-nocturne-casca.md`
- Add evidence: `.superpowers/evidence/redesign-nocturne-casca/`
- Modify focused tests only when assertions describe the old approved labels; never weaken coverage

**Step 1: Add exact Portuguese/Spanish label pairs**

Reuse existing keys first. Add only missing exact UI labels and Spanish translations for the three section names and renamed destinations. Verify no dictionary key is duplicated and do not use seeded business-data names as dictionary keys.

**Step 2: Add the operator-visible change fragment**

Create `.changes/redesign-nocturne-casca.md` with type `capacidade_nova`, describing the shell redesign without version changes or operator action.

**Step 3: Run focused gates**

Under Node 22 and pnpm 9.15.9, run the navigation completeness test, product-ruler test, branding contrast test, default-theme Playwright spec, and all directly changed component/navigation tests.

**Step 4: Prove both sabotage paths**

Temporarily restore the old frozen ruler and capture the failing ruler-test output; restore the generated ruler and rerun green. Temporarily remove the `Funis de vendas` compact entry and capture the focused menu test failing plus a browser screenshot showing the missing item; restore it and rerun green. Never commit the sabotaged state.

**Step 5: Capture visual evidence**

Open the same authenticated screen at the same viewport in light and dark themes and save side-by-side evidence under `.superpowers/evidence/redesign-nocturne-casca/`. Measure key shell/component styles with `getComputedStyle` and layout with `getBoundingClientRect`; do not approve by eye alone.

**Step 6: Run the full acceptance**

Run `npm run verify` if present; because this repository exposes the authoritative gate as `corepack pnpm gov:verify`, run that gate regardless. Then run `corepack pnpm test:unit` separately as explicitly requested. Preserve literal exit codes and summaries. Run the requested named tests again after any fix.

**Step 7: Final review, push and PR**

Review the complete diff against the forbidden-path list, confirm no hex from Nocturne exists outside `app/globals.css`, confirm the spacing scale and light default are unchanged, commit the remaining files, push the branch, and open a PR against `main` without merging, versioning or deploying.
