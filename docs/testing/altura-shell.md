# Altura da shell — medição local, 10/set/2026

Branch: `codex/altura-shell`, derivada de `codex/contraste-shell` em
`e6b72f31f23f08bdfd0156fc897dac1bce0e823e`. Conserto: `7303d0878`.
Não houve merge, PR, deploy, acesso à VPS ou mudança de schema.

## Mudança e causa

`AppShell.tsx` envolve somente os filhos não-Inbox em
`flex min-h-full flex-col`. O contêiner tem altura automática: as raízes
`h-full` deixam de resolver contra a altura definida do `main`. O mínimo
preenche a área nas telas curtas. O `main` conserva sua rolagem e a sidebar
permanece no lugar. Nenhum arquivo de implementação da Agenda foi alterado,
nenhum mínimo arbitrário foi acrescentado à grade e nenhum hex foi criado.

O teste de navegação de `agenda-tela-do-produto.spec.ts` ganhou apenas a abertura
do menu recolhido em largura menor que 768px. A primeira execução mobile passou
os três casos da grade, mas não chegou ao histórico: tentava clicar no link
desktop oculto. A preparação corrigida continuou navegando por clique e manteve
todas as asserções. O recorte então passou 10/10 em 390×720.

## Ambiente e provas

Node 22.23.2, pnpm 9.15.9, Chromium/Playwright e build de produção local.
Supabase próprio `zapfloo-altura`, PostgreSQL 15, API 57321/DB 57322:
`supabase/baseline.sql` aplicado com parada em erro, `scripts/bootstrap-owner.ts`
e seeds canônicos de credenciais/agenda. Dados e números são fixtures locais.
Sem credenciais de IA, Resend ou Google; nenhum provedor/WhatsApp real exercitado.
O stack pré-existente de outro worktree não foi usado nem reinicializado.

Evidências: `.superpowers/evidence/altura-shell/`. JSONs são medidas por
`getBoundingClientRect` e `getComputedStyle`, após aguardar conteúdo visível,
sem skeleton. Métricas, equipe e funil têm também controles positivos do conteúdo.
Capturas são complemento, não a prova de altura. Traces, credenciais e logs de
seed não fazem parte da entrega.

| CONCLUÍDO E TESTADO | PENDENTE | BLOQUEADO |
| --- | --- | --- |
| Regressão original: quatro casos pedidos vermelhos; 2 casos de preparação verdes e 4 seguintes não executados por dependência serial. `original-e2e.log`. | Nenhuma alteração adicional de produto está incluída neste lote. | Nenhum bloqueio de acesso para esta prova local. |
| Conserto: 10/10 no recorte desktop e 10/10 mobile, incluindo os quatro casos pedidos. `verde-e2e.log` e `verde-mobile-navegacao-e2e.log`. | A integração da branch é decisão do dono; não foi aberta PR. | A navegação mobile inicial foi um defeito de preparação da spec, corrigido sem mudar a tela. |
| Sonda: 12 rotas × 2 larguras = 24 estados sem falhas, repetidos após restaurar. `verde-medidas.json` e `restaurado-medidas.json`. | Não confirmados quatro vermelhos na repetição adversarial; detalhes abaixo. | — |
| `corepack pnpm gov:verify`: typecheck, lint (0 erros, 310 avisos), lint de canais e papéis e 7.869 testes em 748 arquivos passaram, inclusive na execução final (`gov-final.log`, exit 0, unitários em 331,10s). | A causa da variação do teste de clique na sabotagem não foi isolada. | — |
| Controle de Inbox: `periodo-de-testes.spec.ts` passou isoladamente, incluindo composer em 1440×900, 768×1024 e 390×844 (`inbox-isolado-e2e.log`, exit 0). | A primeira execução desse controle falhou; a causa não foi isolada. Não foi excluída do relato. | — |

## Geometria: altura de raiz antes → depois, em pixels

Altura da viewport: 720px nas duas larguras. A comparação é entre builds reais
original e corrigido, não apenas edição no inspetor.

| Tela | 1280px | 390px | O que a medida permite afirmar |
| --- | --- | --- | --- |
| Agenda | 498 → 1572 | 494 → 1888 | Colapso real dos filhos: corpo da grade 0 → 752 nas duas larguras; histórico 0 → 128/154. |
| Métricas | 498 → 1974 | 494 → 2660 | Raiz limitada; conteúdo já transbordava, não tinha altura zero. |
| Equipe | 498 → 482,5 | 494 → 639 | Altura natural restaurada; no desktop o conteúdo é menor que o piso do contêiner. |
| Conexões | 498 → 646 | 494 → 1186 | Raiz limitada; filhos não colapsaram. |
| Perfil | 498 → 598 | 494 → 642 | Raiz limitada; filhos não colapsaram. |
| Segurança | 498 → 736 | 494 → 968 | Raiz limitada; filhos não colapsaram. |
| Organização | 498 → 1016 | 494 → 1232 | Raiz limitada; formulário não tinha altura zero. |
| Notificações | 498 → 626 | 494 → 992 | Raiz limitada; filhos não colapsaram. |
| Plano | 498 → 242 | 494 → 262 | Tela curta: o contêiner permanece com 498/494, preenchendo o espaço disponível. |
| Solicitações LGPD | 498 → 499,5 | 494 → 607,5 | Conteúdo preservado, altura natural restaurada. |
| Funil individual | 498 → 293,5 | 494 → 439,5 | Quadro natural 171,5; etapas reais carregadas, áreas de drop com dimensões positivas. Não comprova drag-and-drop. |
| Inbox | 514 → 514 | 510 → 510 | Controle: ramo não alterado, dimensões dos filhos preservadas. |

Somente a Agenda teve colapso a zero confirmado nesta amostra. Não é correto
afirmar que as demais telas estavam todas inutilizáveis. Na Agenda corrigida,
a sonda confirmou `main.scrollTop > 0`, documento sem rolagem vertical e
sidebar com topo 0 no desktop. As medidas não são uma auditoria de toda interação
nem um aceite geral de responsividade de todas essas telas.

## Sabotagem

A retirada isolada de `min-h-full` e a retirada do contêiner inteiro são
mutações diferentes. A primeira foi compilada e testada: os 10 casos da Agenda
**continuaram verdes** (`sem-min-e2e.log`). A grade manteve 752px. A sonda
reprovou exclusivamente o piso de Plano, nas duas larguras
(`sem-min-sonda.log`, exit 1): contêiner 242/262 em vez de 498/494.

Portanto, não foi possível confirmar a premissa de que remover somente
`min-h-full` deixaria as quatro falhas vermelhas. É o contêiner de altura
automática que desfaz o colapso; o mínimo protege outra propriedade.

A segunda mutação retirou o contêiner completo, reproduzindo o código anterior.
A sonda confirmou grade de volta a 0px em 1280×720 e 390×720
(`sem-wrapper-medidas.json`, exit 1). O recorte E2E terminou com **3 falhas,
3 passes e 4 não executados** (`sem-wrapper-e2e.log`): os dois arrastes e
o histórico reprovaram; o clique em bloco passou nesta repetição. Na execução
original, esse mesmo clique também havia falhado. A causa dessa diferença entre
rodadas não foi isolada; não atribuímos proteção geométrica determinística ao
teste de clique. A sonda separada detectou o colapso nos dois tamanhos.

**Limite do aceite adversarial:** não confirmamos quatro vermelhos na repetição
da sabotagem. Confirmamos quatro na reprodução inicial, três na repetição sem
contêiner e dois colapsos geométricos. Não foram alteradas as asserções dos casos
para fabricar esse resultado.

Após restaurar e recompilar, os 10 casos da Agenda passaram novamente em desktop
(`restaurado-e2e.log`) e 390px (`restaurado-mobile-e2e.log`); a sonda voltou
a passar os 24 estados (`restaurado-sonda.log`, exit 0). A rodada desktop tinha
também um controle adicional de Inbox, que falhou esperando o textbox Mensagem
ficar visível em 5 segundos; por isso o comando completo terminou em exit 1,
**10 passes/1 falha**, e não foi descrito como uma suíte toda verde.
Repetição isolada, sem mudar a spec ou o build: **1 passed**, exit 0, 19,1s
(`inbox-isolado-e2e.log`). Confirmou prazo persistente, composer dentro da
viewport e ausência de overflow horizontal em 1440×900, 768×1024 e 390×844.
A causa da primeira falha não foi isolada; o resultado não foi apagado.

## Reprodução

Use Node 22/Corepack e um Supabase **local exclusivo** preparado pelo baseline.
Gere `.env.e2e` com `e2e:env`, sem abrir/copiar env de produção, e execute os
seeds canônicos. Não comite env, credenciais, traces ou dumps.

```sh
corepack pnpm e2e:build
E2E_PORT=3222 ALTURA_ACTION_TIMEOUT=15000 corepack pnpm exec playwright test \
  --config .superpowers/evidence/altura-shell/playwright-altura.config.ts \
  tests/e2e/agenda-grade-interativa.spec.ts:145 \
  tests/e2e/agenda-grade-interativa.spec.ts:206 \
  tests/e2e/agenda-grade-interativa.spec.ts:369 \
  tests/e2e/agenda-tela-do-produto.spec.ts --reporter=line
# Repetir com ALTURA_WIDTH=390. Rodar a spec serial inteira preserva a preparação.
ALTURA_PORT=3224 node --env-file=.env.e2e --import tsx \
  .superpowers/evidence/altura-shell/medir-altura.ts restaurado
corepack pnpm gov:verify
# Controle adicional do ramo Inbox:
E2E_PORT=3222 corepack pnpm exec playwright test \
  --config .superpowers/evidence/altura-shell/playwright-altura.config.ts \
  tests/e2e/periodo-de-testes.spec.ts --reporter=line
```

Neste ambiente, os comandos de runtime também receberam
`SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:57322/postgres` e
`AUTH_RATE_LIMIT_LOGIN_IP=1000` para o banco próprio e logins repetidos de QA.
O timeout de ação de 15 segundos só limita cliques impossíveis nas rodadas
adversariais; as expectativas das specs não foram reduzidas.

## Living System Checklist

- Entrada: `children`, `isInbox` e avisos existentes de `AppShell`.
- Saída: contêiner das páginas autenticadas não-Inbox; Agenda e demais raízes
  `h-full` consomem altura automática. Inbox conserva seu ramo.
- Atividade/log: não há mutação de domínio nova; nenhuma atividade sintética foi
  criada para apresentar uma correção de CSS como execução de negócio.
- Tela e porta: rotas existentes, via `lib/navigation/registry.ts`; o clique em
  Calendário foi exercitado nos menus desktop e mobile. Nenhuma porta nova.
- Anti-morte, configuração e IA↔humano: não se aplicam a esta mudança de layout;
  não foram criados processos, estados persistidos ou configuração.
- Retorno: os testes existentes da Agenda detectam a regressão original; a
  sonda geométrica separa o colapso do preenchimento mínimo de tela curta.
- Mapa vivo: sem aresta de domínio/arquitetura nova. Atualizado o mapa de
  jornadas, sem re-renderizar nem alterar diagramas de funcionalidades.
- Fragmento: `.changes/2026-09-10-altura-shell.md`, correção visível, sem ação
  exigida do operador.

## O QUE NÃO FOI MEDIDO

- VPS, deploy, CI remoto, transporte WhatsApp, e-mails e chamadas reais de IA.
- `test:db`/invariantes RLS: o baseline foi aplicado para a prova de UI, não
  equivale à suíte de banco. Não houve alteração de schema/RLS.
- Suíte E2E inteira, todos os caminhos com `h-full`, layouts aninhados de IA,
  editor de fluxos e todas as interações de cada uma das 12 rotas.
- Contraste/tema escuro não revalidado neste lote de altura; o fix da branch-base
  foi preservado, mas sua evidência anterior não é uma execução desta tarefa.

## Revisão e preservação

Revisão independente somente de leitura: conserto, preparação mobile e sonda sem
bloqueio encontrado. O apontamento de reprodutibilidade foi atendido incluindo
os dois scripts de QA na branch, junto de logs, JSONs e capturas locais.
O código da Agenda, os outros worktrees e `.codex/config.toml` do dono não foram
alterados. A branch depende de `codex/contraste-shell`; deve ser integrada
depois dela. O conserto está testado nos recortes descritos, mas o aceite literal
de quatro vermelhos na sabotagem permanece parcialmente não confirmado.
