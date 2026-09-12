# Leva final — causas medidas, não atribuídas pela linha do erro

Branch `codex/altura-shell`, base `003994ec16128364e86effdbcaea64a425e1b4a4`.
O pedido anuncia seis falhas, mas enumera sete casos: caso, etapa, silêncio,
wizard, espanhol, degradação e agente novo. Este relatório acompanha os nomes.
Não inclui as specs da Leva B, main, VPS, deploy ou mudança de schema.

## Diagnóstico reproduzido

| Caso | Causa medida | Correção delimitada |
|---|---|---|
| Limpeza dos três gatilhos | A falha de `page.request.post` no `finally` substituía uma asserção conhecida do corpo. | Catch somente no teardown; o corpo continua reprovando. |
| Caso, etapa e silêncio | Botão Salvar habilitado, mas fora da viewport; o motor ainda não era alcançado. A hipótese de `!dirty` não ocorreu nessas sequências. | Corpo rolável e rodapé separado; limite menor entre `70dvh` e espaço real do popover. |
| Wizard | Primeiro erro real: espera `connect-whatsapp`, mas navega para `setup-ai`, ordem atual de PASSOS. O locator seguinte ainda procurava nome no header da marca, em vez de `aside h1`. | Destino explícito desta branch; para a identidade, mesmo hunk já existente em `codex/jornada-p0`, sem importar sua decisão de ordem nem sua reescrita inteira. |
| Espanhol | As cinco acusações eram a inicial “E” do nome da empresa, não texto português. | Régua reconhece apenas a inicial decorativa derivada do nome no cartão da empresa; não ignora todo `aria-hidden` nem cria allowlist “E”. Controle ES/PT compara a mesma tela. |
| Degradação | Na prova estendida, entrega positiva chegou e assinatura permaneceu ativa, mas a primeira verificação não ocorreu em 60s. A chave de consulta nova a cada render reiniciava o timer de 45s. O quadro também não renderizava aviso de divergência. | Chave estável por funil; aviso condicionado ao detector existente. Teste acompanha entrega positiva, perda, refetch, recuperação e aviso; sem `test.fail`. |
| Agente novo | O próprio formulário não oferecia links para seus dois pré-requisitos. | Caminhos para credenciais e números conectados junto aos campos; não oferecidos na edição somente leitura. |

Geometria de base medida por `getBoundingClientRect` e `getComputedStyle`:

| Viewport | Popover (topo…base) | Salvar (topo…base) | Espaço disponível | Habilitado / hit-test |
|---|---|---|---|---|
| 1280×720 | 286…790px | 805…837px | 434px | sim / não |
| 390×720 | 322…826px | 841…885px | 398px | sim / não |

## Provas e sabotagens

- Harness: a mesma injeção `page.request.dispose()` seguida da asserção
  `LEVA_FINAL_ERRO_ORIGINAL_CONHECIDO` reportou primeiro o erro de limpeza e,
  depois do catch, a asserção original. Injeção removida.
- Links: remoção independente de cada link reprovou os dois testes do destino
  correspondente em PT/ES; o outro destino permaneceu verde. Teste adicional
  reproduziu e evitou oferecer cadastro/conexão à edição somente leitura.
- Régua i18n: ignorar `aria-hidden` globalmente reprovou cinco controles
  negativos; restaurada, 13 casos passaram. Texto comum, botão, `sr-only`,
  inicial incompatível e frase legítima no cartão continuam na medição.
- Cadência: restaurar a chave não memoizada reprovou o refetch após 44
  redesenhos, um por segundo; o controle de troca de funil permaneceu verde.
- Aviso: antes de implementado, os dois casos PT/ES falharam e o controle
  sem divergência passou; a versão implementada passou os três.

Na primeira rodada corrigida, oito de nove casos passaram; o wizard ainda
esperava a rota antiga. Alinhado a `setup-ai`, seu caso isolado passou. Na
sabotagem de browser, os nove reprovaram (exit1), sem skips: links ausentes;
detector recuperou a marca sem aviso; cinco falhas de alcance do popover;
cinco rótulos “Sua empresa” vazaram em espanhol; nome congelado em “Minha
Empresa”. Código restaurado, incluindo Sidebar/OnboardingFrame com diff zero.
O detector sabotado só na UI mediu assinatura `subscribed`, duas entregas
suprimidas, divergências0→1, dado recuperado e aviso falso.

Rodada final conjunta restaurada: **21 passed (5.4m), exit 0, zero skips**.
São sete casos solicitados, duas geometrias do popover, três interações da
grade, sete casos da Agenda como produto e duas sondas editor/Agenda.

| Viewport final | Popover | Salvar | Hit antes/depois | Grade Agenda |
|---|---|---|---|---|
| 1280×720 | 286…712px; 426px de altura | 667…699px | sim/sim | 752px |
| 390×720 | 322…712px; 390px de altura | 655…699px | sim/sim | 752px |

No detector restaurado: assinatura `subscribed`, duas entregas suprimidas,
divergências 0→1, marca recuperada e aviso verdadeiro. Fontes numéricas em
`.superpowers/evidence/leva-final/*-final.json`. Os testes preservam o teto de
70dvh; esta geometria não prova isoladamente a mutação que remove só esse teto,
porque o espaço disponível nestas duas posições já é menor que 504px.

### Pendência exposta pelo wizard completo

`wizard-do-funcionario.spec.ts` inteiro: **1 failed, 9 did not run,
3 passed (44.8s), exit 1**. Os nove não rodaram porque a spec preexistente
é serial; nenhum skip foi acrescentado. O quarto caso, “o passo do telefone
pergunta COMO se conecta antes de assumir o código”, espera
`/onboarding/connect-whatsapp`, mas a navegação real termina em
`/onboarding/setup-ai`, ordem de PASSOS desta branch. O terceiro caso (nome)
passou também nesta execução.

O restante não é declarado verde nem atribuído só pelo código: a execução parou
ali. `codex/jornada-p0` reescreve essa spec e muda a ordem do produto; copiar
essa decisão nesta leva misturaria trabalhos que o pedido mandou separar.
Fica pendente compatibilizar os próximos casos com a jornada efetivamente
aprovada, em uma leva delimitada. **Estes sete consertos não fecham o E2E
completo nem autorizam declarar o PR pronto para merge.**

### Gates gerais

| Comando, neste worktree e com Node 22 | Resultado |
|---|---|
| `corepack pnpm gov:verify` | exit 0; typecheck e ambos os lints adicionais verdes; ESLint 0 erros/309 avisos; Vitest 753 arquivos, **7900 testes passaram**, 280,73s |
| `corepack pnpm test:db` | exit 0; baseline install/update, 167 arquivos; **1374 passaram, 1 skip preexistente**, 324,11s |
| `corepack pnpm release:conferir` | exit 0; 32 fragmentos válidos, incluindo os três desta leva; simulação de minor, nada escrito/publicado |
| `git diff --check` | exit 0 |

`gov:verify` rodou o `vitest run` completo, não apenas `tests/unit/`.
Não rodou no checkout principal; esta medição pertence a
`.worktrees/altura-shell`. Não reabre nem substitui o aceite antigo dos gates
com worktrees aninhados no checkout principal.
O skip de banco é `webhooks-inbound.test.ts`: “rate limit 429 após estourar
a janela — coberto por unit test do fallback in-memory”. O arquivo não mudou.
Nenhuma alteração de schema: migration/baseline/MANIFEST não se aplicam.

### Fechamento do escopo

| Concluído e testado | Pendente | Bloqueado |
|---|---|---|
| Sete casos nomeados, popover nas duas larguras e coexistência editor/Agenda: 21 E2E verdes. Teardown e cada conserto foram sabotados antes da restauração. | Wizard completo: corrigir a expectativa da etapa seguinte e executar os nove casos que não rodaram, sem importar decisões da P0 nesta leva. | Aceite do E2E completo do PR não pode ser declarado: wizard completo termina vermelho. |
| `gov:verify`, `test:db`, conferência de release; três fragmentos, mapa e evidências curadas. Tudo em `codex/altura-shell`, sem main/merge/deploy. | Acompanhar o CI do novo push; o verde local não é resultado de CI. | Nenhum impedimento de infraestrutura nesta rodada. |

## Ambiente e reprodução

Node 22.23.2, `corepack pnpm` 9.15.9. Build de produção local, Chromium,
1 worker, zero retries, app em 3222; Supabase QA em 57421/57422, já preparado
com baseline. Não é nova instalação fresca nesta rodada. Sem chamadas reais
de IA, WhatsApp, Redis externo ou VPS.

Comandos dos gates:

```sh
corepack pnpm gov:verify
corepack pnpm test:db
corepack pnpm release:conferir
```

O recorte E2E usa as sete specs homônimas e os nomes do pedido, mais os dois
casos “Salvar gatilho fica alcançável” em `followup-builder.spec.ts`.
O wrapper local ignorado `.superpowers/editor-altura/run.mjs` injeta apenas
credenciais do Supabase QA pela CLI e executa build/Playwright. Não imprime
as chaves, não lê env de instalação e não é um comando portátil do clone.
As specs e os unitários são versionados.

## Living System Checklist

- Entrada → saída: formulário real → PATCH de `trigger_config` existente;
  eventos de caso/etapa e dreno existentes continuam donos do enrollment.
  Não há novo motor, envio simulado ou alteração de configuração persistida.
- Próximo passo/portas: o agente aponta para `/app/ai/credentials` e
  `/app/connections`, portas já registradas. Nenhuma tela ou rota nova.
- Sinal de vida: `useBoard` preserva o relógio existente; divergência entre
  cache e refetch sem entrega recente alimenta aviso humano. O aviso só nasce
  de observação real e não promete detecção instantânea nem reconexão concluída.
- Configuração/anti-morte: nenhum env ou knob novo; recuperação periódica
  continua automática. O teste vigia redesenhos e troca de funil.
- Auditoria/continuidade: navegação e layout não mutam banco; persistência e
  eventos seguem rotas existentes. Handoff, IA, consentimento e transporte
  permanecem inalterados. Não há ação externa nova para auditar.
- Retorno: teste de browser cobre salvar/recarregar, gatilho e cancelamento;
  o aviso informa que novas mudanças podem atrasar mesmo após recuperar dados.
  Unitários cobrem ausência de aviso saudável e tradução.
- Mapa/versão: registro de jornadas acompanha o recorte; três fragmentos de
  produto. Harness, régua e ajuste de locator não têm fragmento próprio porque
  não alteram a operação de uma VPS. Nenhuma nova aresta de arquitetura.

## O que não foi medido

VPS, deploy, WhatsApp ou IA reais, cobrança, pareamento, jornada P0 inteira,
toque em aparelho, todos os navegadores e a suíte E2E completa. A prova de
degradação é do quadro do funil, não do Inbox/dossiê. “390px” é Chromium
desktop estreito. CI só poderá ser declarado depois de medir o run do push.
