# Dashboard Personalizável Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que cada usuário reorganize, oculte e redimensione widgets permitidos do painel, com default seguro e isolamento por tenant.

**Architecture:** Um catálogo central define widgets, papéis e tamanhos. Um schema Zod versionado sanitiza preferências no servidor. A API autenticada persiste o layout por `(organization_id, user_id)` e o dashboard consome a preferência sem abrir consultas arbitrárias.

**Tech Stack:** Next.js 16 Route Handlers, React 19, TanStack Query, Zod 4, Supabase/Postgres com RLS, Vitest e Playwright.

**Spec:** `docs/superpowers/specs/2026-09-09-redesign-copiloto-dashboard.md`

## Global Constraints

- Nenhum widget aceita SQL, expressão ou endpoint arbitrário.
- O servidor remove ids desconhecidos e widgets acima do papel efetivo.
- Migration nova + baseline idempotente + MANIFEST + tipos gerados são atômicos.
- Falha de preferência nunca derruba o dashboard operacional.

---

### Task 1: Contrato puro do layout

**Files:**
- Create: `lib/dashboard/preferences.ts`
- Create: `lib/dashboard/preferences.test.ts`

- [ ] **Step 1: Write failing tests** — cobrir default, ordem, tamanhos permitidos, ids desconhecidos, papel mínimo, schema antigo e layout vazio.
- [ ] **Step 2: Run RED** — `pnpm vitest run lib/dashboard/preferences.test.ts`; esperado: módulo ausente.
- [ ] **Step 3: Implement minimal catalog/schema/sanitizer** — ids estáveis, `schema_version=1` e fallback canônico.
- [ ] **Step 4: Run GREEN** — mesma suíte.

### Task 2: Persistência tenant-aware

**Files:**
- Create: `supabase/migrations/20260909130000_0227_user_dashboard_preferences.sql`
- Modify: `supabase/baseline.sql`
- Modify: `supabase/migrations/MANIFEST.md`
- Modify: `lib/database.types.ts` (regenerar, não editar manualmente)
- Create: `tests/invariants/user-dashboard-preferences.test.ts`

- [ ] **Step 1: Write failing DB invariant** — provar own-user/own-org read-write e negar segundo usuário/segundo tenant.
- [ ] **Step 2: Run RED** — executar a spec de invariante antes da migration.
- [ ] **Step 3: Add migration** — tabela, PK composta, FKs, índice de `user_id`, constraints básicas, RLS e privilégios mínimos.
- [ ] **Step 4: Append idempotent baseline and MANIFEST** — sem editar migrations aplicadas.
- [ ] **Step 5: Regenerate types** — usar o comando canônico do repositório.
- [ ] **Step 6: Run GREEN** — `pnpm test:db`, incluindo install e update do baseline.

### Task 3: API de preferências

**Files:**
- Create: `app/api/v1/dashboard/preferences/route.ts`
- Create: `tests/unit/dashboard-preferences-route.test.ts`
- Modify: `lib/audit/actions.ts`

- [ ] **Step 1: Write failing route tests** — GET default/sanitizado, PUT válido/inválido, DELETE somente da pessoa, autenticação, papel e filtros explícitos.
- [ ] **Step 2: Run RED** — confirmar 404/módulo ausente.
- [ ] **Step 3: Implement handlers** — `requireRole("viewer")`, Zod, client de sessão quando possível, filtros `organization_id` + `user_id`, wrappers canônicos e audit sem layout completo.
- [ ] **Step 4: Run GREEN** — suíte de rota e typecheck.

### Task 4: Modo de edição no dashboard

**Files:**
- Refactor: `components/dashboard/Dashboard.tsx`
- Modify: `components/dashboard/useDashboard.ts`
- Create: `components/dashboard/DashboardCustomizer.tsx`
- Create: `components/dashboard/widgets/**`
- Modify: `components/dashboard/dashboard.module.css`
- Create: `tests/unit/dashboard-customizer.test.tsx`
- Create/Modify: `tests/e2e/dashboard.spec.ts`

- [ ] **Step 1: Write failing UI tests** — entrar em edição, reordenar, ocultar, redimensionar, cancelar, salvar e restaurar.
- [ ] **Step 2: Run RED** — confirmar controles ausentes.
- [ ] **Step 3: Split widgets and wire preference query** — manter APIs reais e TanStack Query; default aparece mesmo se GET falhar.
- [ ] **Step 4: Implement editor** — preview, teclado, salvar/cancelar/restaurar, feedback acessível e uma coluna no mobile.
- [ ] **Step 5: Run GREEN** — unitários + E2E da jornada com dois usuários.
