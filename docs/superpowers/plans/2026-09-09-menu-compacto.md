# Menu Compacto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar a navegação compacta aprovada sem remover rotas nem alterar permissões.

**Architecture:** O registro canônico continuará sendo `lib/navigation/registry.ts`; uma nova projeção pura descreve as oito áreas e suas abas contextuais usando os destinos existentes. `Sidebar.tsx` desenha apenas essa projeção e `AreaNavigation.tsx`, montado no `AppShell`, desenha a segunda camada conforme a rota atual.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6, Tailwind 4, Vitest e Playwright.

**Spec:** `docs/superpowers/specs/2026-09-09-menu-compacto.md`

## Global Constraints

- Preservar todas as rotas, dados e permissões existentes.
- Não tocar no banco, Supabase, WhatsApp ou arquivos `.env`.
- Usar `Link` do Next.js para transições client-side.
- Provar desktop e mobile pela interface antes de publicar.

---

### Task 1: Contrato da projeção compacta

**Files:**
- Modify: `tests/unit/navegacao-registry.test.ts`
- Modify: `lib/navigation/registry.ts`

**Interfaces:**
- Produces: `compactAreas(isPlatformAdmin, role)` com áreas, abas permitidas e posição `main|footer`.

- [ ] **Step 1: Write the failing test** — exigir a ordem exata das oito áreas e a composição das abas de Conversas, Funis, IA, Relatórios, Agenda e Configurações.
- [ ] **Step 2: Run test to verify it fails** — `pnpm vitest run tests/unit/navegacao-registry.test.ts`; esperado: falha por `compactAreas` ausente.
- [ ] **Step 3: Write minimal implementation** — declarar a configuração no registro, resolver cada href para destino ou hub e filtrar por `canSee`.
- [ ] **Step 4: Run test to verify it passes** — mesmo comando; esperado: todos os casos verdes.
- [ ] **Step 5: Commit** — incluir com a entrega única depois da prova visual.

### Task 2: Sidebar e barra contextual

**Files:**
- Modify: `tests/unit/sidebar-grupos.test.tsx`
- Modify: `components/shell/Sidebar.tsx`
- Create: `components/shell/AreaNavigation.tsx`
- Modify: `app/app/_components/AppShell.tsx`
- Modify: `lib/i18n/dicionario.ts`

**Interfaces:**
- Consumes: `compactAreas(isPlatformAdmin, role)`.
- Produces: sidebar com oito portas e barra de abas com `aria-current`.

- [ ] **Step 1: Write the failing test** — exigir ausência de cabeçalhos antigos, oito portas para admin e destaque do pai em rota secundária.
- [ ] **Step 2: Run test to verify it fails** — `pnpm vitest run tests/unit/sidebar-grupos.test.tsx`; esperado: lista antiga divergente.
- [ ] **Step 3: Write minimal implementation** — trocar grupos expansíveis por links principais e montar `AreaNavigation` acima do conteúdo.
- [ ] **Step 4: Run test to verify it passes** — rodar os dois arquivos unitários de navegação.
- [ ] **Step 5: Commit** — incluir com a entrega única depois da prova visual.

### Task 3: Prova da jornada e publicação

**Files:**
- Modify: `tests/e2e/navegacao.spec.ts`
- Modify: `docs/testing/user-journey-map.md`
- Create: `.changes/2026-09-09-menu-compacto.md`

**Interfaces:**
- Consumes: menu e abas já renderizados.
- Produces: evidência visual desktop/mobile e nota de versão para o operador.

- [ ] **Step 1: Write the failing test** — atualizar a jornada para clicar `Início`, abrir abas secundárias e medir overflow.
- [ ] **Step 2: Run test to verify it fails** — executar a spec de navegação contra a versão anterior quando o ambiente E2E estiver disponível.
- [ ] **Step 3: Write minimal implementation** — ajustar apenas seletores e caminhos que mudaram, preservando as provas de hubs e busca.
- [ ] **Step 4: Run verification** — `pnpm typecheck`, `pnpm lint`, testes unitários relevantes, build e a spec Playwright; registrar qualquer limitação real.
- [ ] **Step 5: Deploy and inspect** — construir imagem amd64 na VPS como exceção local, subir `app` com os dois arquivos compose, confirmar labels, health e navegar visualmente em `crm.zapfloo.tech`.
- [ ] **Step 6: Commit** — commit local; não fazer push sem pedido explícito.
