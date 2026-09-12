# Publicação segura do redesign Zapfloo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auditar, publicar e comprovar o redesign no runtime Zapfloo sem depender de GitHub Actions pago e sem misturar correções não comprovadas ao lote.

**Architecture:** O SHA local é a unidade imutável da entrega. O código é exportado com `git archive`, construído numa release isolada da VPS e aplicado somente ao serviço `app` por um override versionado; o app anterior permanece disponível para rollback. Banco, WAHA, Redis, worker, scheduler e proxy não são alterados porque o delta desde a última publicação não contém schema nem consumidores desses serviços.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, pnpm 9, Vitest, Playwright, Docker Compose, Caddy, Supabase Cloud.

**Spec:** `docs/superpowers/specs/2026-09-09-redesign-operacional-fluxos-canais.md`

## Global Constraints

- Não abrir, copiar ou registrar valores de `.env`.
- Não enviar mensagens de WhatsApp, alterar pareamento ou criar dados em organização real.
- Não executar `down -v`, `prune`, migration indiscriminada ou remoção de imagens.
- Não empilhar patches: cada correção exige causa, teste RED, implementação mínima e GREEN.
- Preservar os overrides e a imagem anterior até o smoke test autenticado terminar.

---

### Task 1: Fechar o candidato local

**Files:**
- Review: `git diff c9f20c75..HEAD`
- Test: `tests/api/followup-flow-generate.test.ts`
- Test: `tests/e2e/redesign-operacional.spec.ts`
- Test: `tests/e2e/followup-builder.spec.ts`

- [ ] **Step 1: Confirmar árvore, SHA, ancestry e ausência de schema/packaging no delta**

Run: `git status --short && git rev-parse HEAD && git diff --name-only c9f20c75..HEAD`

- [ ] **Step 2: Revisar manualmente as bordas de autenticação, tenant, validação, rate limit, auditoria e segredo no endpoint novo**

Run: `git diff c9f20c75..HEAD -- app/api/v1/ai/followup-flows/generate/route.ts lib/followup/ai-draft.ts`

- [ ] **Step 3: Executar os gates completos relevantes**

Run: `corepack pnpm gov:verify && corepack pnpm test:db && corepack pnpm build`

- [ ] **Step 4: Executar auditoria de dependências e varreduras de segredos**

Run: `corepack pnpm audit --prod --audit-level high` e scanner de segredos disponível, sem imprimir valores.

### Task 2: Provar os fluxos em navegador local

**Files:**
- Test: `tests/e2e/redesign-operacional.spec.ts`
- Test: `tests/e2e/followup-builder.spec.ts`
- Test: `tests/e2e/navegacao.spec.ts`

- [ ] **Step 1: Rodar Playwright nas jornadas alteradas e preservar screenshots sintéticos**

Run: `corepack pnpm exec playwright test tests/e2e/redesign-operacional.spec.ts tests/e2e/followup-builder.spec.ts tests/e2e/navegacao.spec.ts`

- [ ] **Step 2: Se surgir falha, reproduzir isoladamente e registrar uma única hipótese antes de editar**

Expected: nenhum código muda sem teste de regressão que falhe pelo motivo esperado.

### Task 3: Preparar release recuperável na VPS

**Files:**
- Create remotely: `/opt/zapfloo/releases/<sha>/source/`
- Create remotely: `/opt/zapfloo/releases/<sha>/docker-compose.redesign-final.yml`
- Create remotely: `/opt/zapfloo/releases/<sha>/deploy.sh`

- [ ] **Step 1: Registrar estado prévio sem expor configuração**

Run remotely: IDs, imagens, saúde, espaço, arquitetura e probe HTTPS; não executar `cat .env`.

- [ ] **Step 2: Exportar o SHA com `git archive`, conferir SHA-256 e transportar somente o artefato versionado**

Expected: checksum local igual ao remoto e nenhuma `.env`, dependência local ou evidência privada no pacote.

- [ ] **Step 3: Construir `zapfloo-app:<sha>` em diretório isolado sem alterar o app ativo**

Expected: build exit 0 e imagem `amd64` identificada pelo SHA.

### Task 4: Publicar apenas o app e validar

**Files:**
- Use remotely: `/opt/zapfloo/docker-compose.prod.yml`
- Use remotely: overrides já ativos e novo override do SHA.

- [ ] **Step 1: Aplicar o override com `pull_policy: never`, `--no-deps` e somente `app`**

Expected: WAHA, Redis, Caddy, worker e scheduler mantêm os IDs anteriores.

- [ ] **Step 2: Confirmar contêiner, versão, health e HTTPS**

Expected: `/api/v1/health` saudável e `/login` acessível; `healthy` isolado não basta.

- [ ] **Step 3: Fazer smoke test autenticado**

Expected: painel, menu fixo, personalização, busca, conversas, fluxos, canais e transcrição carregam sem mutar dados reais nem enviar mensagens.

- [ ] **Step 4: Em regressão, executar rollback automático para a imagem anterior**

Expected: somente o app volta; sem restauração de banco, volumes ou segredos.

### Task 5: Registrar evidência operacional

**Files:**
- Create: `docs/superpowers/reports/2026-09-09-publicacao-final-redesign.md`

- [ ] **Step 1: Registrar SHA, imagem, horário, comandos, exit codes, escopo, limites e rollback**

- [ ] **Step 2: Executar `git diff --check`, revalidar a árvore e criar commit documental separado se necessário**
