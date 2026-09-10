# Task 2 — avanço visível, IA adiável e saída única persistente

Status: `DONE_WITH_CONCERNS`

Commits:

- `a912e98f7` (`fix(onboarding): concluir conexão sem impor IA`)
- `c407b3525` (`fix(onboarding): exigir seleção e auditar adiamento`)

## Escopo implementado

- O fluxo QR preserva o `channel_session_id` recebido no `POST` mesmo quando o polling `GET` devolve somente o estado.
- Ao observar `WORKING`, o cliente chama uma única vez o escritor canônico da Task 1 com o contrato estrito `{ channel_session_id }`.
- Uma falha da confirmação fica visível e acionável, com nova tentativa exclusivamente manual; não há laço automático de mutações.
- A interrupção `NEXT_REDIRECT` do sucesso da Server Action é relançada e não vira mensagem de erro local.
- “Conferir canais conectados” consulta a lista autenticada existente. Um único canal é confirmado diretamente; múltiplos canais começam com seleção vazia, placeholder e confirmação desabilitada até uma escolha explícita. O estado exibido pelo navegador não é usado como prova: o mesmo escritor canônico faz a validação viva.
- A projeção SSR reutiliza `listSelectableChannels`; o refresh no cliente reutiliza `nomeDoCanal`, sem duplicar a cadeia de fallback de nomes.
- A IA pode ser adiada por uma escolha explícita. `skipAi` preserva agente, rascunho/template, revisão, versão, ensaio e recibo de ativação já existentes, alterando somente `skipped: true` no estado do wizard.
- Depois do patch bem-sucedido, `skipAi` registra `onboarding.ai_skipped`; falha de persistência não produz auditoria de sucesso nem redirecionamento.
- Adiar IA não acessa o cliente admin e portanto não publica, ativa, desativa nem altera políticas/allowlists de canais.
- Depois de confirmar uma revisão, o ensaio volta para `/onboarding`; o roteador escolhe o próximo passo realmente pendente, em vez de impor novamente a conexão.
- As cópias de `ExplorarCrm` foram removidas da conexão, boas-vindas e ensaio. O controle permanece somente no layout comum.
- O cookie de exploração ganhou `maxAge: 60 * 60 * 24 * 30`, preservando `httpOnly`, `sameSite`, `secure`, `path` e o valor vinculado a usuário e tenant.
- O dicionário espanhol recebeu todas as novas mensagens apresentadas pela interface.

## TDD — RED e GREEN

### RED inicial

Os testes foram escritos/ajustados antes das mudanças de produção. A primeira execução focada provou, entre outros, estes defeitos:

- `WORKING` não chamava `markWhatsappConfigured`;
- a sequência `POST com UUID -> GET WORKING sem UUID` perdia a referência;
- falha de confirmação não tinha mensagem acionável nem retry;
- “Conferir canais conectados” não chamava o escritor;
- o cookie não tinha expiração positiva;
- `skipAi` apagava o estado existente de IA;
- o ensaio impunha `/onboarding/connect-whatsapp`;
- a composição real de layout + conteúdo renderizava duas saídas em três superfícies.

No teste principal de conexão, o primeiro RED terminou em `4 failed | 9 passed`: ausência da chamada em `WORKING`, perda do UUID, ausência de erro/retry e conferência sem efeito.

Um RED adicional para a borda de navegação terminou em `1 failed | 14 passed`: `relancarInterrupcaoDoNext` ainda não existia, demonstrando que o `catch` genérico capturava também o sucesso por redirect.

### GREEN focado

Comando final focado, usando Node 22 e o prefixo prescrito no brief:

```bash
corepack pnpm vitest run \
  tests/unit/rotulo-do-contato.test.ts \
  tests/unit/onboarding-escolhe-como-conecta.test.tsx \
  tests/unit/onboarding-ai-adiamento.test.ts \
  tests/unit/onboarding-explorar-unico.test.tsx \
  tests/unit/onboarding-exploracao.test.ts \
  tests/unit/onboarding-ensaio-ui.test.tsx \
  tests/unit/onboarding-setup-selecao.test.tsx \
  tests/unit/onboarding-conexao-sem-ia.test.tsx \
  tests/unit/onboarding-setup-ai-aviso.test.tsx \
  tests/unit/onboarding-recuperar-ui.test.tsx --reporter=dot
```

Resultado real final: `Test Files 10 passed (10)`; `Tests 55 passed (55)`; exit `0`.

## Sabotagens efetivas e restauração

Cada sabotagem foi aplicada temporariamente com `apply_patch`, executada somente contra o teste que deveria detectá-la e restaurada antes do GREEN final.

| Mudança guardada | Sabotagem | Evidência RED | Restauração |
|---|---|---|---|
| conclusão ao observar `WORKING` | remoção do efeito que chama o escritor | teste “QR WORKING confirma…”: `markWhatsappConfigured` recebeu 0 chamadas; exit `1` | efeito de tentativa única por UUID restaurado |
| UUID entre POST e polling | troca do merge funcional por `setInfo(json.data)` | teste “preserva o UUID…”: escritor recebeu 0 chamadas; exit `1` | merge que mantém `antes.channel_session_id` restaurado |
| expiração da exploração | remoção de `maxAge` | `onboarding-exploracao`: objeto do cookie sem `maxAge: 2592000`; exit `1` | `maxAge` de 30 dias restaurado |
| adiamento preserva IA | retorno à sobrescrita `{ agent_id: "", skipped: true }` | `onboarding-ai-adiamento`: agente, template, revisão e recibo ausentes; exit `1` | merge de `state.ai` antes de `skipped: true` restaurado |
| roteamento após revisão | retorno a `router.push("/onboarding/connect-whatsapp")` | teste de ensaio esperava `/onboarding`; exit `1` | navegação pelo roteador `/onboarding` restaurada |
| saída única | reinserção de `ExplorarCrm` em `welcome/page.tsx` | composição layout + welcome encontrou 2 botões em vez de 1; exit `1` | cópia local removida novamente |

O redirect controlado também teve RED anterior à implementação do relançamento. O teste cobre tanto `message`/`digest` de `NEXT_REDIRECT` quanto erro comum, que continua sendo convertido em mensagem acionável.

## Verificações

Todos os comandos usaram:

```text
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH
COREPACK_ENABLE_DOWNLOAD_PROMPT=0
NODE_OPTIONS=--max-old-space-size=4096
```

- `corepack pnpm exec eslint <17 arquivos alterados>`: exit `0`, sem saída.
- `corepack pnpm typecheck`: exit `0` após o ajuste final.
- `git diff --check`: exit `0`.
- Testes focados finais: 10 arquivos, 55 testes, todos verdes, exit `0`.
- `corepack pnpm test:unit > /tmp/task2-test-unit.log 2>&1`: executado uma única vez, fora do sandbox, conforme o brief. Resultado anterior ao ajuste do resolvedor de nome: `1 failed | 752 passed (753)` arquivos e `1 failed | 7905 passed (7906)` testes, exit `1`. A única falha era `tests/unit/rotulo-do-contato.test.ts > nenhum arquivo remonta a cadeia de fallback à mão`, causada pela nova linha da Task 2.
- A falha consolidada foi corrigida usando `nomeDoCanal`; o próprio teste que falhou entrou no GREEN focado final. A suíte completa não foi repetida, por instrução explícita de coordenação; o root executará `gov:verify` consolidado após o commit.
- O root informou separadamente `test:db` exit `0`: 167 arquivos, 1.374 testes passados e 1 skip preexistente, install/update do baseline verdes. Task 2 não alterou banco ou schema.

## Arquivos do commit

### Produção

- `app/actions/onboarding/createDefaultAgent.ts`
- `app/actions/onboarding/explorar.ts`
- `app/onboarding/connect-whatsapp/_client.tsx`
- `app/onboarding/connect-whatsapp/page.tsx`
- `app/onboarding/setup-ai/_ensaio.tsx`
- `app/onboarding/setup-ai/page.tsx`
- `app/onboarding/welcome/page.tsx`
- `lib/i18n/dicionario.ts`
- `lib/audit/actions.ts`

### Testes

- `tests/unit/onboarding-ai-adiamento.test.ts`
- `tests/unit/onboarding-conexao-sem-ia.test.tsx`
- `tests/unit/onboarding-ensaio-ui.test.tsx`
- `tests/unit/onboarding-escolhe-como-conecta.test.tsx`
- `tests/unit/onboarding-exploracao.test.ts`
- `tests/unit/onboarding-explorar-unico.test.tsx`
- `tests/unit/onboarding-recuperar-ui.test.tsx`
- `tests/unit/onboarding-setup-ai-aviso.test.tsx`
- `tests/unit/onboarding-setup-selecao.test.tsx`

## Ajustes da revisão — rodada 1

Commit: `c407b3525`.

### RED/GREEN

- Seleção múltipla, RED: o teste recebeu `55555555-5555-4555-8555-555555555555` onde esperava valor vazio; `1 failed | 14 skipped`, exit `1`.
- Auditoria, RED: o adiamento bem-sucedido registrou zero chamadas; `1 failed | 1 skipped`, exit `1`.
- GREEN final focado: `onboarding-escolhe-como-conecta`, `onboarding-ai-adiamento` e `audit-lista-do-painel-e-derivada`; `Test Files 3 passed (3)`, `Tests 22 passed (22)`, exit `0`.
- ESLint pertinente: exit `0`, sem saída.
- `corepack pnpm typecheck`: exit `0`.
- `git diff --check`: exit `0`.
- A suíte unitária completa não foi repetida, conforme a instrução da rodada.

### Comandos literais e logs da rodada 1

RED inicial e sabotagem da pré-seleção automática — o mesmo comando foi executado nas duas passagens:

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm vitest run tests/unit/onboarding-escolhe-como-conecta.test.tsx -t "com mais de um canal inicia vazio" --reporter=dot
```

```text
FAIL ... > com mais de um canal inicia vazio e não confirma antes da escolha explícita
Expected the element to have value:
Received: 55555555-5555-4555-8555-555555555555
Test Files  1 failed (1)
Tests       1 failed | 14 skipped (15)
exit=1
```

GREEN isolado da seleção, executado entre o RED inicial e as sabotagens:

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm vitest run tests/unit/onboarding-escolhe-como-conecta.test.tsx -t "com mais de um canal inicia vazio" --reporter=dot
```

```text
Test Files  1 passed (1)
Tests       1 passed | 14 skipped (15)
exit=0
```

RED inicial da auditoria e sabotagem por remoção — o mesmo comando foi executado nas duas passagens:

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm vitest run tests/unit/onboarding-ai-adiamento.test.ts -t "preserva a IA e audita" --reporter=dot
```

```text
FAIL ... > preserva a IA e audita o adiamento somente depois de persistir
AssertionError: expected "vi.fn()" to be called once, but got 0 times
Test Files  1 failed (1)
Tests       1 failed | 1 skipped (2)
exit=1
```

GREEN isolado da auditoria, incluindo sucesso e falha de persistência:

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm vitest run tests/unit/onboarding-ai-adiamento.test.ts --reporter=dot
```

```text
Test Files  1 passed (1)
Tests       2 passed (2)
exit=0
```

Sabotagem por auditoria antecipada:

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm vitest run tests/unit/onboarding-ai-adiamento.test.ts -t "erro ao persistir" --reporter=dot
```

```text
FAIL ... > erro ao persistir não marca a etapa nem navega
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
action: onboarding.ai_skipped
Test Files  1 failed (1)
Tests       1 failed | 1 skipped (2)
exit=1
```

GREEN final dos três arquivos pertinentes:

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm vitest run tests/unit/onboarding-escolhe-como-conecta.test.tsx tests/unit/onboarding-ai-adiamento.test.ts tests/unit/audit-lista-do-painel-e-derivada.test.tsx --reporter=dot
```

```text
Test Files  3 passed (3)
Tests       22 passed (22)
exit=0
```

Lint pertinente:

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm exec eslint app/onboarding/connect-whatsapp/_client.tsx app/actions/onboarding/createDefaultAgent.ts lib/audit/actions.ts lib/i18n/dicionario.ts tests/unit/onboarding-escolhe-como-conecta.test.tsx tests/unit/onboarding-ai-adiamento.test.ts
```

```text
(sem saída)
exit=0
```

Typecheck:

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm typecheck
```

```text
> tsc --noEmit -p tsconfig.typecheck.json
exit=0
```

Cheque de whitespace:

```bash
git diff --check
```

```text
(sem saída)
exit=0
```

### Sabotagens adicionais e restauração

- Pré-seleção automática restaurada temporariamente com `setCanalSelecionado(encontrados[0]?.id ?? "")`: o teste recebeu o primeiro UUID em vez de vazio e falhou, exit `1`. Restaurado o valor vazio quando há mais de um canal.
- Auditoria removida depois do patch: o teste esperava uma chamada de `onboarding.ai_skipped` e recebeu zero, exit `1`. Bloco restaurado.
- Auditoria antecipada para antes do patch: com o patch rejeitado, o teste observou uma auditoria de sucesso indevida e falhou, exit `1`. Ordem `patch → audit → redirect` restaurada e coberta por `invocationCallOrder`.

## Preocupações e limites

- A única execução completa de `test:unit` foi vermelha antes do ajuste final de `nomeDoCanal`; a falha pertinente e toda a fatia focada ficaram verdes depois, mas a confirmação consolidada fica para o `gov:verify` do root.
- Não foi executada prova visual/E2E nesta Task 2. O plano reserva a cobertura E2E e a evidência visual para a Task 3; nenhum arquivo E2E/config/workflow foi alterado.
- O vocabulário canônico agora inclui a ação específica `onboarding.ai_skipped`; nenhuma ação de configuração ou ativação foi reutilizada. A ação não toca runtime nem políticas de canal.
- Os arquivos paralelos `.changes/2026-09-10-conexao-sem-ia.md`, `docs/architecture/onboarding-ativacao-restrita.architecture.json`, `docs/superpowers/plans/2026-09-10-jornada-p0-correcao.md` e `docs/testing/jornada-p0-sem-ia.md` pertencem ao root e ficaram fora dos commits.
