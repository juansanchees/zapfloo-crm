# Altura da shell — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para executar os passos nesta sessão, com os resultados medidos como checkpoints.

**Goal:** recuperar a altura natural das telas sem alterar a Agenda.

**Architecture:** o `main` conserva a altura da viewport e a rolagem; um contêiner flex com altura automática e piso `min-h-full` separa as páginas não-inbox dessa altura definida. Inbox conserva seu ramo atual.

**Tech Stack:** Next.js 16, Tailwind 4, Node 22, pnpm 9.15.9, Playwright, Supabase local pg15.

**Spec:** pedido do dono “CONSERTO DE ALTURA DA SHELL”, nesta tarefa: branch derivada de `codex/contraste-shell`, quatro casos da Agenda, medidas 1280×720 e 390px, sabotagem, fragmento e mapa de jornadas.

## Restrições globais

- Sem main, PR, deploy, VPS, schema ou alterações nas telas da Agenda.
- Preservar `.codex/config.toml` e os outros worktrees.
- Nenhum mínimo arbitrário na grade; nenhum token/hex novo.
- Não confundir retirada de `min-h-full` com retirada do contêiner inteiro: medir ambas se necessário.

## Tarefa única — conserto de classe e prova

**Arquivos:** `app/app/_components/AppShell.tsx`; `.changes/2026-09-10-altura-shell.md`; `docs/testing/user-journey-map.md`; relatório e sondas em `.superpowers/evidence/altura-shell/`.

**Consome:** `children`, `isInbox` e `onboardingNotice` da shell existente.
**Produz:** layout não-inbox com altura natural, sem nova API.

- [x] Criar `codex/altura-shell` a partir de `e6b72f31f`, em worktree limpo.
- [x] Subir banco local próprio, aplicar `baseline.sql`, executar bootstrap e seeds canônicos; não usar `.env.local`.
- [x] Rodar `corepack pnpm e2e:build`; `node --env-file=.env.e2e --import tsx .superpowers/evidence/altura-shell/medir-altura.ts original`. Grade colapsada registrada por geometria, exit 1.
- [x] Rodar `corepack pnpm exec playwright test --config .superpowers/evidence/altura-shell/playwright-altura.config.ts tests/e2e/agenda-grade-interativa.spec.ts:145 tests/e2e/agenda-grade-interativa.spec.ts:206 tests/e2e/agenda-grade-interativa.spec.ts:369 tests/e2e/agenda-tela-do-produto.spec.ts`. A spec serial roda inteira para preservar sua navegação de preparação: quatro falhas originais confirmadas.
- [x] Aplicar somente `{isInbox ? children : <div className="flex min-h-full flex-col">{children}</div>}` na shell; manter o aviso fora do wrapper.
- [x] Rebuild e repetir os testes e a sonda `verde`, com viewport 1280×720 e 390×720. Comparar métricas das raízes/filhos de Agenda, metrics, team, connections, settings, LGPD e pipeline: 24 estados; 10 E2E verdes em cada largura após abrir o menu mobile na preparação da spec.
- [x] Sabotar `min-h-full`, rebuild e repetir; testar também retirada integral do wrapper. Resultado divergente do aceite original, registrado no relatório: sem mínimo os E2E passam, piso de Plano reprova; sem wrapper três E2E reprovam e grade mede zero. Fonte correta restaurada.
- [x] Executar `corepack pnpm gov:verify`: 748 arquivos/7.869 testes passaram. Inbox passou isoladamente após uma falha inicial registrada, sem mudar spec/build.
- [x] Recompilar fonte restaurada: Agenda 10/10 novamente em cada largura; sonda 24/24 estados.
- [x] Registrar limites reais de cobertura, Living System Checklist, fragmento e jornada.

Entrega somente por push de `codex/altura-shell`, sem merge/PR/deploy. O commit
de produto é `7303d0878`; a evidência segue em commit separado. Conferência final:
`git rev-parse HEAD` e `git ls-remote origin refs/heads/codex/altura-shell`
devem devolver o mesmo SHA. As divergências adversariais permanecem explicitadas
em `docs/testing/altura-shell.md`, não convertidas em critérios cumpridos.
