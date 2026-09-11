# Editor de fluxos e Agenda — prova de coexistência

## Escopo

Branch `codex/altura-shell`, PR #7. Sem alterar AppShell permanentemente,
Agenda, schema, transporte, main ou VPS. Base inicial `24c1610a2`; durante a
rodada chegaram os fast-forwards `ed78c121b` e `224db795` (mudanças somente em
`pipelines-gestao.spec.ts`, fora do recorte abaixo), preservados integralmente.
A base final consolidada é `224db7953156f95c300d6de55bc22fcdb5769067`.

A prova usa Node 22.23.2, pnpm 9.15.9, Chromium serial, zero retries,
build/start de produção e Supabase local 57421/57422, sem transporte real.
Esse banco de QA já havia recebido o baseline em uma rodada anterior: esta
rodada **não prova uma instalação zerada**. O perfil de pareamento 57321
não foi reiniciado. Não foram lidos `.env*` nem alteradas credenciais reais.

## Instrumento

`tests/e2e/editor-e-agenda-altura.spec.ts` mede `getBoundingClientRect` e
`getComputedStyle` em 1280×720 e 390×720. Verifica área do canvas/React Flow,
nó contido, pane visível, hit-test e redução real da escala (`DOMMatrix`) ao
diminuir zoom. O acesso ao zoom e depois ao gatilho usa `mouse.wheel` real no
padding do `main`; `elementFromPoint` prova que o gesto não nasce sobre o canvas
nem sobre uma barra externa. Não se usa `scrollIntoViewIfNeeded`. Também se
medem transbordo horizontal e separação dos controles na largura de 390px.
A mesma sessão mede grade e histórico da Agenda, inclusive quando o editor
reprova. Fixture própria por caso, isolada por UUID e removida ao terminar.

No caso de 1280px, a mesma página sobe a 1200px, atravessa o breakpoint
767↔768 e recebe um bloco DOM vazio de 180px, depois 240px, antes do wrapper do
conteúdo. É um **estímulo sintético de layout**, não um aviso real nem evento de
negócio. A prova exige que o fundo do workspace continue alinhado ao fundo do
`main` (tolerância de 2px) e sempre restaura 1280×720. `scrollHeight` é anexado
como diagnóstico: o aviso de onboarding mais `min-h-full` pode produzir
overflow preexistente, portanto zero global não é critério de aceite.

Não confundir o viewport desta prova com o das specs antigas: várias delas
fixam 1600×900/1000 ou altura 900 internamente. A configuração padrão 1280×720
não substitui os viewports definidos por cada teste.

O recorte combinado contém os 12 casos de editor solicitados, mais 10 da
Agenda (os quatro solicitados, com o arquivo serial inteiro para conservar
a preparação) e os dois casos geométricos: **24 testes**, sem skip novo.

## Medidas finais

| Viewport | Editor | Agenda |
| --- | --- | --- |
| 1280×720 | Canvas 539px; overflow horizontal 0px; zoom real `2 → 1,66667`; gatilho clicado, aberto e fechado após wheel real com hit-test seguro | Corpo da grade 752px; histórico 128px |
| 390×720 | Canvas 389px; overflow horizontal 0px; zoom real `1,45536 → 1,2128`; gatilho clicado, aberto e fechado após wheel real com hit-test seguro; Adicionar nó e controles sem sobreposição | Corpo da grade 752px; histórico 154px |

## Histórico do diagnóstico

| Árvore / tentativa | Execução e resultado medido | Interpretação |
| --- | --- | --- |
| Sem ajuste do editor | `base-r3-e2e`: exit 1, **12 failed / 10 passed** | Reproduziu todos os casos do editor; Agenda permaneceu verde. |
| Geometria original, instrumento sincronizado | `base-geometria-r1`: exit 1, **2 failed** | Canvas 0 nas duas larguras; corpo da Agenda 752px. Desktop: linha do canvas 539px, canvas 0px. |
| Remover somente `h-full` do canvas | `fix-geometria`: exit 0, **2 passed**; `fix-combinado`: exit 1, **3 failed / 21 passed** | Canvas 539px desktop/389px celular. Restaram builder :521, journey :224 e linguagem :84. |
| Diagnóstico passivo desses três casos | `diagnostico-r1`: exit 1, **2 failed / 1 passed** | Arrastes dy620/650 excedem canvas539 e auto-pan desloca nós anteriores; linguagem passou nesta repetição. Não foi atribuído causalmente ao mesmo defeito. |
| `h-dvh` ainda com `flex-1` no builder | `fix2-dirigido`: exit 1, **2 failed / 3 passed** | Altura computada ainda 600px: declarar altura não basta quando o flex item a comprime. |
| FIX3 — `h-dvh` com `shrink-0` | `fix3-combinado`: exit 1, **2 failed / 22 passed** | Rejeitado. Criou rolagem do `main`; uma conexão ficou em 2/3 arestas e a posição após reload desviou 222px. Verde parcial não autorizou manter a estratégia. |
| FIX4 — altura útil real do `main` | `fix4-combinado`: exit 0, **24 passed** | Mede o espaço restante e conserva o piso existente de 600px. É verde do recorte, não aceite final: ainda não reagia a irmão interno que mudasse sem resize do `main`. |
| Mutação de irmão anterior | `aviso-red`: exit 1, **1 failed / 1 passed** | A largura 1280 reprovou como previsto: ao inserir 180px o desalinhamento foi 180px; ao crescer para 240px foi 240px. A largura 390, que não recebe o estímulo, permaneceu verde. |
| FIX5 — observar `main` e irmãos anteriores | Build exit 0; `fix5-geometria`: exit 0, **2 passed** em 41,0s | `ResizeObserver` dos elementos relevantes mais `MutationObserver(childList)` recompôs o workspace em 1280/390. No estímulo 180→240px, `workspace.bottom` permaneceu alinhado a `main.bottom` (delta 0px); remoção e 767↔768 também passaram. Revisão independente não apontou achado importante/crítico nem ciclo, mas o alcance continua limitado à estrutura DOM atual. |
| Sabotagem do editor, com FIX5 removido | Build exit 0; `sabotagem-editor`: exit 1, **14 failed / 10 passed** em 8,1min | Vermelho causal: falharam exatamente os 12 casos antigos do editor e as duas sondas geométricas novas; os 10 casos da Agenda permaneceram verdes. FIX5 foi restaurado após a rodada. |
| Sabotagem do AppShell, com FIX5 retido | Build exit 0; `sabotagem-shell-r1`: exit 1, **5 failed / 3 passed / 4 did not run** em 2,1min | As duas sondas reprovaram com corpo da grade e histórico em 0px nas duas larguras. Dos quatro casos antigos solicitados, três reprovaram (arrastes :206/:369 e histórico :125) e o clique :145 passou; os quatro restantes não rodaram pela cascata serial já existente, sem skip novo. A prova exata 4/4 não foi atingida. AppShell restaurado exatamente ao HEAD. |
| Rodada final após ambas as restaurações | Build limpo exit 0; `final-r1-combinado`: exit 0, **24 passed** em 3,5min, zero skips | Os 12 casos antigos do editor, os 10 da Agenda e as duas sondas geométricas passaram juntos. É o aceite do recorte de UI; os gates locais são registrados abaixo. |
| Gate `gov:verify` | Exit 0; **749 arquivos / 7.874 testes** em 282,25s; lint com 0 erros/310 avisos; channels 62 dívidas conhecidas/0 novas; role-rank ok | Gate de tipo, lint e unidade aprovado no worktree `altura-shell`. Avisos e dívidas preexistentes não foram ocultados. |
| Conferência de release | `release:conferir`: exit 0, 29 fragmentos | Conferência somente leitura aprovada; nada foi escrito. Não equivale a corte/publicação de release. |
| Gate `test:db` | Exit 0; **167 arquivos / 1.374 testes passados + 1 skip preexistente** em 383,40s; install/update com `ON_ERROR_STOP=1` | Gate de banco aprovado; nenhum invariante/schema foi alterado. O teardown removeu somente o contêiner efêmero desta rodada. |

Tentativas de harness não contam como prova de produto: a primeira execução
foi interrompida (exit 130); a seguinte não iniciou por porta ocupada; a
primeira sonda mediu DOM anexado mas ainda não pintado; o primeiro diagnóstico
passivo não coletou testes por import relativo incorreto; a primeira preparação
da sabotagem do AppShell e a primeira preparação da rodada final pararam no
build com `ENOTEMPTY` sob `.next/server`, antes de executar testes. A recorrência
foi tratada como falha de preparação/limpeza do artefato Next, sem causa
atribuída. Todas foram identificadas e substituídas por execuções completas ou
repetidas sem mudança de fonte, sem esconder o erro.

## Aceite local final e sabotagens

O recorte final de UI foi aprovado: build limpo exit 0 e 24/24 testes juntos,
sem skips, após restaurar FIX5 e AppShell. A sabotagem do editor produziu o
vermelho esperado sem derrubar a Agenda. A sabotagem do AppShell derrubou as
duas sondas e três dos quatro casos antigos alvo, mas não atingiu a prova exata
4/4; isso permanece como ressalva. `gov:verify` e a conferência de release
passaram; `test:db` também passou, incluindo install/update. Assim, build,
recorte E2E e todos os gates locais aplicáveis estão verdes.

## Reprodução

Com banco E2E local e build de produção configurados pelo procedimento do projeto:

```bash
corepack pnpm exec playwright test \
  tests/e2e/followup-builder.spec.ts:230 \
  tests/e2e/followup-builder.spec.ts:255 \
  tests/e2e/followup-builder.spec.ts:303 \
  tests/e2e/followup-builder.spec.ts:348 \
  tests/e2e/followup-builder.spec.ts:521 \
  tests/e2e/followup-journey.spec.ts:224 \
  tests/e2e/followup-linguagem.spec.ts:84 \
  tests/e2e/followup-ramos.spec.ts:120 \
  tests/e2e/followup-tempo-adaptativo.spec.ts:142 \
  tests/e2e/followup-publicado-abre-no-construtor.spec.ts:77 \
  tests/e2e/fluxo-gatilho-no-editor.spec.ts:6 \
  tests/e2e/fluxo-controles-contraste.spec.ts:6 \
  tests/e2e/agenda-grade-interativa.spec.ts:145 \
  tests/e2e/agenda-grade-interativa.spec.ts:206 \
  tests/e2e/agenda-grade-interativa.spec.ts:369 \
  tests/e2e/agenda-tela-do-produto.spec.ts \
  tests/e2e/editor-e-agenda-altura.spec.ts
```

Nesta máquina foi usado um wrapper local ignorado em
`.superpowers/editor-altura/run.mjs` para obter apenas as chaves da CLI do
Supabase QA e injetar o ambiente no build/start/runner, evitando o `.env.e2e`
legado de outro perfil. Config própria: porta3222, Chromium, viewport padrão
1280×720, um worker, zero retries, ação limitada a15s, trace no vermelho.
Esse wrapper é infraestrutura local, **não é um comando portátil do clone**.
Os testes e sua inscrição no workflow são versionados.

## Living System Checklist

- Entrada/saída: grafo real recebido pelo `FlowBuilder` → canvas e painéis de
  configuração existentes; não há novo evento, endpoint ou dado de negócio.
- Atividade e continuidade: inalteradas; ajuste de layout não emite nem simula
  execução de automação, envio ou resposta de IA.
- Superfície/porta: editor existente em `/app/ai/followups/[id]`, acessado pela
  lista de fluxos. Nenhuma rota ou configuração nova para registrar/traduzir.
- Próximo passo: restaura acesso a nós, configuração e publicação já existentes;
  não altera regras de follow-up, handoff ou automação.
- Retorno: spec geométrica declarada no workflow vigia espaço pintado, wheel,
  hit-test, zoom por escala real e o retorno ao gatilho. UI, `gov:verify` e
  `test:db` passaram localmente.
- Mapa: sem nova aresta de arquitetura; o mapa de jornadas registra o recorte
  efetivamente executado. Fragmento em `.changes/` por efeito visível no operador.

## O que não foi medido

VPS, deploy, instalação fresca nesta rodada, pareamento/WhatsApp, envio real,
IA real, outros navegadores e o restante da suíte E2E fora do recorte. A largura
390 foi exercitada com mouse/Chromium de desktop, não como toque em aparelho.
O bloco 180→240px não prova o ciclo de vida, animação ou conteúdo de um aviso
real: ele só discrimina recomposição geométrica. A sabotagem do AppShell não
provou vermelho exato nos quatro casos antigos, pois um passou e a cascata
serial impediu quatro casos posteriores de rodar. A observação cobre a estrutura
DOM atual; não prova recomposição para hierarquias futuras. CI, a P0 completa e
os 15 casos antigos fora de escopo não foram executados nesta rodada. Commit,
push e rebase são atos posteriores de entrega, não medições deste documento;
nenhum status deles é afirmado aqui.
