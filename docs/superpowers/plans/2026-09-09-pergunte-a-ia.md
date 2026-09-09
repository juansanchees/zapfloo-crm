# Pergunte à IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um copiloto somente-leitura que responda sobre dados acessíveis do CRM e mostre evidências realmente consultadas.

**Architecture:** A rota autenticada usa o seam `runModelCall` e uma allowlist explícita de handlers MCP de leitura. Uma ponte dedicada executa as tools com organização e papel reais, registra apenas metadados higienizados e deriva fontes da execução, nunca do texto do modelo.

**Tech Stack:** Next.js 16 Route Handlers, React 19, AI SDK 7, Zod 4, Supabase, Vitest e Playwright.

**Spec:** `docs/superpowers/specs/2026-09-09-redesign-copiloto-dashboard.md`

## Global Constraints

- Zero mutações, mensagens, SQL livre, service key, secrets ou PII em logs/audit.
- A allowlist é curta e revisada; `risco="seguro"` é pré-condição, não inclusão automática.
- A organização e o papel vêm de `requireRole("agent")`.
- A conversa não é persistida nesta versão.

---

### Task 1: Allowlist e ponte segura de ferramentas

**Files:**
- Create: `lib/ai/copilot/tools.ts`
- Create: `lib/ai/copilot/tools.test.ts`
- Modify: `lib/audit/actions.ts`

- [ ] **Step 1: Write failing security tests** — cada nome deve existir, ser `read`, `mcp:read`, `risco=seguro`, não `apenasHumano`; nenhuma ferramenta fora da lista pode executar.
- [ ] **Step 2: Run RED** — módulo ausente.
- [ ] **Step 3: Implement bridge** — contexto real, `createAdminClient`, role check, filtro do catálogo e tracking de tools executadas; audit apenas `{tool_name,duration_ms,success}`.
- [ ] **Step 4: Run GREEN** — testes de seleção, erro e tracking.

### Task 2: Contrato do copiloto e chamada do modelo

**Files:**
- Create: `lib/ai/copilot/schema.ts`
- Create: `lib/ai/copilot/prompt.ts`
- Create: `lib/ai/copilot/run.ts`
- Create: `lib/ai/copilot/run.test.ts`
- Modify: `lib/ai/pontos/registro.ts`

- [ ] **Step 1: Write failing tests** — 2.000 caracteres, seis mensagens, oito passos, `purpose=copilot_query`, timeout, output cap e fontes derivadas das tools.
- [ ] **Step 2: Run RED** — módulos/propósito ausentes.
- [ ] **Step 3: Implement minimal runner** — instrução de leitura, idioma do usuário, `runModelCall`, fontes por mapa determinístico de tool → rota.
- [ ] **Step 4: Run GREEN** — teste com seam e tools falsos, sem chamada externa.

### Task 3: Route Handler seguro

**Files:**
- Create: `app/api/v1/ai/ask/route.ts`
- Create: `tests/unit/ai-ask-route.test.ts`

- [ ] **Step 1: Write failing route tests** — auth, role, validação, rate limit org+user, resposta e tradução dos erros de credencial/orçamento/timeout.
- [ ] **Step 2: Run RED** — rota ausente.
- [ ] **Step 3: Implement handler** — request id, `requireRole("agent")`, Zod, limite técnico e `ok`/`fail`; nenhum conteúdo da pergunta/resposta em log.
- [ ] **Step 4: Run GREEN** — suíte de rota e typecheck.

### Task 4: Página Pergunte à IA e portas de acesso

**Files:**
- Create: `app/app/ai/ask/page.tsx`
- Create: `components/ai/copilot/CopilotPage.tsx`
- Modify: `components/shell/Sidebar.tsx`
- Modify: `components/shell/CommandPalette.tsx`
- Modify: `lib/navigation/registry.ts`
- Modify: `lib/i18n/dicionario.ts`
- Create: `tests/unit/copilot-page.test.tsx`
- Create: `tests/e2e/pergunte-a-ia.spec.ts`

- [ ] **Step 1: Write failing UI/navigation tests** — ação global, busca, envio por teclado, loading, erro, resposta, fontes e nenhuma ação de escrita.
- [ ] **Step 2: Run RED** — controles/rota ausentes.
- [ ] **Step 3: Implement client page** — histórico só em memória, seis mensagens de contexto, links para fontes e estados acionáveis.
- [ ] **Step 4: Run GREEN** — unitários, navegação e Playwright com API simulada sem dados reais.

### Task 5: Arquitetura viva e gates

**Files:**
- Create/Modify: mapas em `docs/architecture/`
- Modify: `docs/testing/user-journey-map.md`
- Create: `.changes/2026-09-09-pergunte-a-ia.md`

- [ ] **Step 1: Document** — entradas, consumidores, allowlist, feedback e falhas.
- [ ] **Step 2: Run gates** — typecheck, lint, unitários, build, E2E e varredura por PII/segredos.
- [ ] **Step 3: Inspect evidence** — confirmar que fontes exibidas foram executadas e que nenhuma mutação foi exposta.
