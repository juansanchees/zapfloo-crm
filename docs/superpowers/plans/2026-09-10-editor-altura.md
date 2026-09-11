# Altura do editor de fluxos — plano de execução

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Passos fortemente dependentes serão executados em sequência; análise e revisão podem ser delegadas somente em leitura.

**Goal:** restaurar o canvas e os controles sem reintroduzir o colapso da Agenda.

**Architecture:** limitar o ajuste ao layout de `app/app/ai/followups/[id]/`. O contêiner de altura automática do `AppShell` continua intacto. A prova mede o espaço pintado, não somente a existência dos nós no DOM.

**Tech Stack:** Next.js 16, Tailwind 4, React Flow, Playwright/Chromium, Node 22.

**Spec:** pedido do dono nesta tarefa: doze casos do editor e quatro da Agenda, juntos, medição em 1280×720 e 390px, duas sabotagens independentes. Sem schema/deploy/merge na main. As quinze falhas antigas estão fora de escopo.

## Restrições globais

- Trabalhar em `codex/altura-shell`, iniciada em `24c1610a2` e atualizada por
  fast-forward até `224db7953156f95c300d6de55bc22fcdb5769067`; os commits
  intermediários tocaram somente `pipelines-gestao.spec.ts`, fora deste recorte.
- Preservar `.codex/config.toml`, outros worktrees e arquivos de credenciais.
- Não remover permanentemente o wrapper `flex min-h-full flex-col` do AppShell.
- Não alterar expectativas existentes para obter verde; não acrescentar hex.
- Rebase de `codex/jornada-p0` somente após salvar o conserto, separado desta alteração.

## Etapas

- [x] Conferir worktree limpo e executar `git fetch origin` e `git merge --ff-only origin/codex/altura-shell`.
- [x] Reproduzir os casos existentes com build de produção e banco local isolado; salvar saída integral, códigos de saída e medidas em `.superpowers/evidence/editor-altura/`.
- [x] Acrescentar prova geométrica ao recorte existente: retângulo do canvas não nulo, nós contidos no canvas, controles alcançáveis por clique e sem transbordo horizontal em 1280×720/390×720. Primeiro executar no código anterior.
- [x] Ajustar somente a cadeia de altura do editor (`page.tsx`, `FlowBuilder.tsx`, `FlowCanvas.tsx`/seu CSS se necessário); recompilar e repetir ambas as famílias juntas. Após restaurar as duas sabotagens, o build limpo e os 24 casos combinados passaram sem skips.
- [x] Sabotar apenas editor, recompilar, repetir e restaurar; em outra rodada remover wrapper do AppShell, recompilar, repetir e restaurar. A sabotagem do editor deu 14 falhas/10 passes; a do AppShell deu 5 falhas/3 passes/4 não executados e não atingiu vermelho exato nos quatro casos antigos.
- [x] Rodar `corepack pnpm gov:verify`, `corepack pnpm test:db` e prova final de UI após restauração, sem concorrência entre gates pesados. Todos passaram localmente.
- [x] Acrescentar fragmento `.changes/`, registro no mapa de jornadas e relatório com três colunas, Living System Checklist e o que não foi medido. `release:conferir` encontrou o fragmento e não escreveu nada.
- [ ] Revisão independente concluída sem impedimento para commit/push sem merge. Commit/push em altura-shell e rebase da jornada-p0 são atos posteriores: conferir a branch limpa, preservar a referência anterior e verificar conflitos/diff antes de qualquer push com lease explícito.

## Decisões de execução

O stack da prova antiga da Agenda foi substituído por outro uso na porta 57321; não será reinicializado. O perfil desta rodada usa o banco local de QA 57421/57422, aplicado do baseline em rodada anterior, sem transporte pareado. É uma nova execução de UI, não uma nova instalação fresca. Config local própria reproduz Chromium serial, zero retries, build/start de produção, porta 3222; não lê o `.env.e2e` legado da altura-shell.

## Registro de decisões e gates

| Tentativa | Evidência medida | Decisão |
|---|---|---|
| FIX3: `h-dvh` + `shrink-0` | `fix3-combinado`: **2 failed / 22 passed** | Rejeitada: o `main` passou a rolar e duas jornadas do builder regrediram. |
| FIX4: medir altura útil real do `main` | `fix4-combinado`: **24 passed** | Verde do recorte, mas incompleto diante de mudanças internas que não redimensionam o `main`. |
| Aviso sintético 180→240px | `aviso-red`: **1 failed / 1 passed**; deltas exatos 180/240px | Regressão causal válida. O bloco vazio é estímulo de layout, não aviso/evento real. |
| FIX5: observar `main` e irmãos anteriores, inclusive `childList` | Build exit 0; `fix5-geometria`: **2 passed** em 41,0s; delta inferior 0px com estímulos de 180/240px e em 767↔768 | Geometria aprovada nas duas larguras. Revisão independente sem achado importante/crítico ou ciclo; alcance limitado à estrutura DOM atual. Recorte final, sabotagens e gates registrados abaixo. |
| Sabotagem do editor | Build exit 0; `sabotagem-editor`: **14 failed / 10 passed** em 8,1min | Vermelho esperado: 12 casos antigos do editor + 2 sondas falharam, enquanto 10 casos da Agenda passaram. FIX5 restaurado antes da sabotagem independente do AppShell. |
| Primeira preparação da sabotagem do AppShell | Build exit 1, `ENOTEMPTY` em `.next/server`; testes não executados | Não conta como sabotagem nem evidência de produto. Repetição iniciada sem mudança de fonte após confirmar ausência de processo, porta e lock ativos. |
| Sabotagem do AppShell, FIX5 retido | Build exit 0; `sabotagem-shell-r1`: **5 failed / 3 passed / 4 did not run** em 2,1min | Duas sondas novas e 3/4 casos antigos alvo reprovaram; clique :145 passou. Os quatro não executados decorreram da cascata serial existente, sem skip novo. Prova exata 4/4 não atingida; AppShell restaurado ao HEAD. |
| Primeira preparação da rodada final | Build exit 1, `ENOTEMPTY` sob `.next/server/app/api`; testes não executados | Segunda ocorrência de falha na limpeza do artefato Next, sem causa atribuída. O `.next` da própria rodada foi movido de forma recuperável e o rebuild do zero começou sem mudança de fonte. Não conta como prova final. |
| Rodada final restaurada | Build limpo exit 0; `final-r1-combinado`: **24 passed**, zero skips, em 3,5min | Aceite do recorte de UI: 12 casos antigos do editor + 10 da Agenda + 2 sondas passaram juntos. Commit e rebase permanecem atos posteriores de entrega. |
| `gov:verify` final | Exit 0; **749 arquivos / 7.874 testes**; lint 0 erros/310 avisos; channels 62 dívidas conhecidas/0 novas; role-rank ok | Gate aprovado no worktree `altura-shell`; não confundir com o checkout principal. |
| `release:conferir` | Exit 0; 29 fragmentos | Conferência sem escrita aprovada; corte/publicação não realizados neste registro. |
| `test:db` final | Exit 0; **167 arquivos / 1.374 testes passados + 1 skip preexistente** em 383,40s; install/update com `ON_ERROR_STOP=1` | Gate aprovado. Nenhum invariante/schema mudou; o teardown removeu somente o contêiner efêmero da rodada. |

A sonda usa wheel real sobre o padding do `main`, hit-test por
`elementFromPoint` e escala do React Flow por `DOMMatrix`. O caso de 390px é
Chromium desktop estreito com mouse, não prova toque. As specs antigas conservam
seus próprios viewports 1600×900/1000 ou altura 900; o viewport padrão da sonda
não os substitui.

## O que não foi medido

CI, suíte E2E completa, P0 completa, outros navegadores, toque em aparelho,
instalação fresca, VPS, transporte/WhatsApp e IA real. O estímulo sintético mede
somente recomposição de layout; não prova o ciclo de vida nem o conteúdo de um
aviso de produto. A sabotagem do AppShell não produziu o vermelho exato 4/4 nos
casos antigos. O observer foi provado contra a estrutura DOM atual, não contra
hierarquias futuras. Commit, push e rebase são atos posteriores de entrega e
não têm status afirmado neste registro.
