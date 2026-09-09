# Redesign Operacional Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidar a moldura compacta e aplicar uma linguagem visual operacional coerente às sete superfícies principais sem alterar regras de negócio.

**Architecture:** O registro de navegação continua como fonte única; shell e superfícies passam a consumir tokens e componentes compartilhados. O conteúdo permanece ligado às APIs existentes, e a cor de marca continua resolvida em runtime.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6, Tailwind 4, Phosphor Icons, Vitest e Playwright.

**Spec:** `docs/superpowers/specs/2026-09-09-redesign-copiloto-dashboard.md`

## Global Constraints

- Não hardcodar Zapfloo nem roxo em código alcançável pelo usuário.
- Preservar rotas, permissões, dados e fluxos atuais.
- Preferir componentes compartilhados a CSS específico por página.
- Não reescrever telas profundas de Configurações, LGPD ou integrações.

---

### Task 1: Fechar o menu compacto já iniciado

**Files:**
- Modify: `lib/navigation/registry.ts`
- Modify: `components/shell/Sidebar.tsx`
- Create: `components/shell/AreaNavigation.tsx`
- Modify: `app/app/_components/AppShell.tsx`
- Modify: `lib/i18n/dicionario.ts`
- Modify: `tests/unit/navegacao-registry.test.ts`
- Modify: `tests/unit/sidebar-grupos.test.tsx`
- Create: `tests/unit/area-navigation.test.tsx`

- [ ] **Step 1: Confirm RED** — executar os testes de navegação contra a revisão anterior e registrar que a projeção compacta/abas não existiam.
- [ ] **Step 2: Review implementation** — conferir oito portas, papéis, `aria-current`, health dot e links para os hubs.
- [ ] **Step 3: Run GREEN** — `pnpm vitest run tests/unit/navegacao-registry.test.ts tests/unit/sidebar-grupos.test.tsx tests/unit/area-navigation.test.tsx tests/unit/idioma-da-interface.test.ts`.
- [ ] **Step 4: Prove responsiveness** — atualizar e executar a jornada Playwright de navegação em desktop e celular.

### Task 2: Consolidar design system v2 operacional

**Files:**
- Modify: `app/globals.css`
- Modify: `docs/design-system/README.md`
- Modify: `docs/design-system/02-palette-sage.md`
- Modify: `docs/design-system/09-anti-patterns.md`
- Create: `components/ui/operational-page.tsx`
- Create: `components/ui/metric-card.tsx`
- Create: `tests/unit/design-system-operacional.test.ts`

- [ ] **Step 1: Write failing test** — exigir tokens semânticos de moldura, workspace, painel e marca em runtime; exigir export dos componentes compartilhados.
- [ ] **Step 2: Run RED** — `pnpm vitest run tests/unit/design-system-operacional.test.ts`; esperado: tokens/componentes ausentes.
- [ ] **Step 3: Implement minimal system** — criar cabeçalho contextual, barra de ações/filtros, card métrico e estados de painel com foco visível e redução de movimento.
- [ ] **Step 4: Reconcile doctrine** — documentar grafite + marca em runtime, mantendo tipografia, ícones e densidade aprovados.
- [ ] **Step 5: Run GREEN** — teste unitário, `pnpm typecheck` e `pnpm lint`.

### Task 3: Aplicar componentes às superfícies principais

**Files:**
- Modify: `components/inbox/**`
- Modify: `components/agenda/**`
- Modify: `app/app/contacts/**`
- Modify: `components/kanban/**`
- Modify: `app/app/ai/agents/**`
- Modify: testes unitários/e2e próximos de cada superfície

- [ ] **Step 1: Add characterization tests** — fixar os fluxos existentes de inbox, agenda, contatos, funis e agentes antes de alterar apresentação.
- [ ] **Step 2: Run characterization suite** — confirmar a linha de base.
- [ ] **Step 3: Apply shared presentation** — padronizar cabeçalhos, filtros, botões, tabs, tabelas/cards e estados sem alterar APIs.
- [ ] **Step 4: Run targeted tests** — executar apenas as suítes das superfícies tocadas e corrigir regressões reais.
- [ ] **Step 5: Visual proof** — Playwright em desktop/tablet/celular, claro/escuro e pt-BR/es.

### Task 4: Documentação e gate do lote visual

**Files:**
- Modify: `docs/testing/user-journey-map.md`
- Create: `.changes/2026-09-09-redesign-operacional.md`
- Modify/Create: mapas em `docs/architecture/`

- [ ] **Step 1: Update living maps** — registrar portas, superfícies, consumidores e fallback.
- [ ] **Step 2: Run required gates** — `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm build` e E2E visual relevante.
- [ ] **Step 3: Inspect screenshots** — verificar overflow, foco, estados e consistência antes de declarar concluído.
