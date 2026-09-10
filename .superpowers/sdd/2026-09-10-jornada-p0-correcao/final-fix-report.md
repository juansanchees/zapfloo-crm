# Onda final integrada — correções dos findings da revisão

Status: `DONE_WITH_CONCERNS`

Base recebida: `d8a657030193c49f84ff5dbc17e36f2a623d5e91`  
Base efetiva após commit documental do root: `2635081cc`  
Commits próprios:

- `247017a41` — `fix(onboarding): proteger contexto e recuperacao da jornada`
- `bee9e8ff0` — `test(onboarding): endurecer preflight e troca de contexto`

## Implementação

### 1. Adiamento de IA preso ao contexto exibido

- `setup-ai/page.tsx` calcula `contextoDoRascunho(user.id, activeOrg.orgId)` no SSR e o entrega ao componente cliente focado `AdiarIa`.
- `skipAi` mantém `requireOnboardingCtx()` como fonte de autenticação, organização, RBAC e MFA. O `expected_context` é somente detector de formulário antigo.
- O contexto é comparado com o usuário e a organização revalidados antes de `loadOnboardingState`, patch, auditoria ou redirect.
- Em conflito, a action retorna `draft_context_changed`; a UI mostra alerta traduzido e o link `Recarregar esta etapa`.
- A ação continua preservando todo `state.ai`, acrescentando apenas `skipped: true`.
- `onboarding.ai_skipped` continua depois do patch bem-sucedido. Patch rejeitado não audita e não redireciona.
- A prova E2E normal agora troca o cookie de A para B com a página A aberta, confirma zero patch/auditoria no gesto antigo, mede o alerta a 390 px com `getBoundingClientRect` e `scrollWidth`, e salva screenshot com `testInfo.outputPath` usando somente fixtures fictícias. Depois clica no link, comprova que o formulário passou a exibir o rascunho de B e consegue adiar B, com um único registro de auditoria.

### 2. UUID preservado durante falhas transitórias do polling

- Os estados de erro HTTP e rejeição de rede fazem merge com o estado anterior.
- O `channel_session_id` recebido no POST sobrevive a `STARTING -> erro -> WORKING` mesmo quando o GET não repete o UUID.
- A falha continua visível e o escritor canônico é chamado exatamente uma vez após a recuperação.

### 3. Preflight sem serialização de registros pessoais

- Os asserts de usuários, organizações/estado, vínculos e fatores recebem somente booleanos ou contagens, com mensagens neutras.
- Um teste AST inspeciona o bloco real do preflight em `tests/e2e/vps-fresh-onboarding.spec.ts` e proíbe `toHaveLength`, `toEqual` e `toMatchObject` nele.
- O controle runtime usa `expect` importado de `@playwright/test`, na versão instalada, e prova que a mensagem da falha do matcher booleano não contém o marcador fictício sensível.

### 4. Erro de confirmação visível fora do QR

- O erro comum só é ocultado quando `forma === "qr" && status === "WORKING"`, porque apenas esse ramo renderiza o alerta especializado.
- Ao sair de QR WORKING para Oficial ou Parceiro, uma falha de `Conferir canais conectados` permanece visível e acionável.

## TDD — RED inicial e GREEN

Todos os comandos Node usaram este prefixo literal:

```text
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096
```

### Finding 1 — contexto A/B

RED da action:

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm vitest run tests/unit/onboarding-ai-adiamento.test.ts -t "organização A não adia" --reporter=dot
```

Resultado: exit `1`; `1 failed | 2 skipped`. A implementação antiga chegou a `loadOnboardingState` e rejeitou com `TypeError`, em vez de retornar `draft_context_changed` sem efeitos.

RED da interface:

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm vitest run tests/unit/onboarding-setup-selecao.test.tsx -t "conflito ao adiar" --reporter=dot
```

Resultado: exit `1`; `1 failed | 1 skipped`; nenhum elemento com `role="alert"` existia.

GREEN conjunto da action e UI:

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm vitest run tests/unit/onboarding-ai-adiamento.test.ts tests/unit/onboarding-setup-selecao.test.tsx --reporter=dot
```

Resultado: exit `0`; `Test Files 2 passed (2)`; `Tests 5 passed (5)`.

### Finding 2 — recuperação do polling

RED:

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm vitest run tests/unit/onboarding-escolhe-como-conecta.test.tsx -t "preserva o UUID durante" --reporter=dot
```

Resultado: exit `1`; os dois casos (`HTTP 503` e `rejeição de rede`) falharam; `markWhatsappConfigured` recebeu zero chamadas após o GET WORKING.

GREEN: mesmo comando, exit `0`; `2 passed | 15 skipped` na primeira passagem após o conserto.

### Finding 3 — preflight

RED:

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm vitest run tests/unit/e2e-preflight-fresco.test.ts --reporter=dot
```

Resultado: exit `1`; `1 failed | 2 passed`; o gate encontrou cinco matchers ricos: três `toHaveLength` e dois `toEqual`.

GREEN após usar o matcher Playwright real no controle:

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm vitest run tests/unit/e2e-preflight-fresco.test.ts --reporter=dot
```

Resultado final: exit `0`; `Test Files 1 passed (1)`; `Tests 3 passed (3)`.

### Finding 4 — alerta fora do QR

RED:

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm vitest run tests/unit/onboarding-escolhe-como-conecta.test.tsx -t "mantém o erro de Conferir" --reporter=dot
```

Resultado: exit `1`; `2 failed | 17 skipped`; Oficial e Parceiro não encontraram `role="alert"`.

GREEN: mesmo comando, exit `0`; `2 passed | 17 skipped`.

## Sabotagens efetivas e restauradas

Cada mutação foi aplicada temporariamente com `apply_patch`, executada somente contra sua proteção e restaurada antes dos commits.

| Proteção | Sabotagem | RED observado | Restauração |
|---|---|---|---|
| contexto A/B | remoção da comparação de `expected_context` | exit `1`; a action avançou para `load` em vez de retornar conflito | comparação antes de toda leitura/escrita restaurada |
| ordem da auditoria | auditoria movida para antes do patch | exit `1`; teste de patch rejeitado observou 1 auditoria indevida | ordem `patch -> audit -> redirect` restaurada |
| UUID no erro HTTP/rede | remoção de `...antes` nos dois estados de erro | exit `1`; 2 casos, escritor recebeu zero chamadas | merge funcional com estado anterior restaurado |
| preflight real | usuário voltou a `expect(usuarios.data.users).toHaveLength(1)` | exit `1`; gate AST encontrou `toHaveLength` no arquivo E2E real | assert booleano neutro restaurado; mutação repetida após trocar o controle para Playwright |
| alerta fora do QR | condição voltou a ocultar todo erro em `status === WORKING` | exit `1`; Oficial e Parceiro sem alerta | ocultação restrita ao ramo QR WORKING restaurada |

Comandos literais das sabotagens:

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm vitest run tests/unit/onboarding-ai-adiamento.test.ts -t "organização A não adia" --reporter=dot
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm vitest run tests/unit/onboarding-ai-adiamento.test.ts -t "erro ao persistir" --reporter=dot
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm vitest run tests/unit/onboarding-escolhe-como-conecta.test.tsx -t "preserva o UUID durante" --reporter=dot
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm vitest run tests/unit/e2e-preflight-fresco.test.ts -t "não entrega registros pessoais" --reporter=dot
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm vitest run tests/unit/onboarding-escolhe-como-conecta.test.tsx -t "mantém o erro de Conferir" --reporter=dot
```

## Verificações finais do executor

GREEN unitário consolidado:

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm vitest run tests/unit/onboarding-ai-adiamento.test.ts tests/unit/onboarding-setup-selecao.test.tsx tests/unit/onboarding-escolhe-como-conecta.test.tsx tests/unit/e2e-preflight-fresco.test.ts --reporter=dot
```

Resultado: exit `0`; `Test Files 4 passed (4)`; `Tests 27 passed (27)`.

Cobertura do dicionário:

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm vitest run tests/unit/i18n-espanhol-cobre-a-tela.test.ts tests/unit/traducao-nao-defasa.test.ts --reporter=dot
```

Resultado: exit `0`; `Test Files 2 passed (2)`; `Tests 16 passed (16)`.

Lint dirigido:

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm eslint app/actions/onboarding/createDefaultAgent.ts app/onboarding/connect-whatsapp/_client.tsx app/onboarding/setup-ai/page.tsx app/onboarding/setup-ai/_adiar.tsx lib/i18n/dicionario.ts tests/unit/onboarding-ai-adiamento.test.ts tests/unit/onboarding-escolhe-como-conecta.test.tsx tests/unit/onboarding-setup-selecao.test.tsx tests/unit/e2e-preflight-fresco.test.ts tests/e2e/vps-fresh-onboarding.spec.ts tests/e2e/troca-de-organizacao-tem-volta.spec.ts
```

Resultado: exit `0`, sem saída.

Typecheck completo, iniciado imediatamente após o FREEZE e antes da mensagem do root dispensando a duplicação:

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm typecheck
```

Resultado: exit `0`; `tsc --noEmit -p tsconfig.typecheck.json`.

`git diff --check`: exit `0`, sem saída.

## Arquivos alterados

Produto:

- `app/actions/onboarding/createDefaultAgent.ts`
- `app/onboarding/connect-whatsapp/_client.tsx`
- `app/onboarding/setup-ai/_adiar.tsx`
- `app/onboarding/setup-ai/page.tsx`
- `lib/i18n/dicionario.ts`

Testes:

- `tests/unit/onboarding-ai-adiamento.test.ts`
- `tests/unit/onboarding-escolhe-como-conecta.test.tsx`
- `tests/unit/onboarding-setup-selecao.test.tsx`
- `tests/unit/e2e-preflight-fresco.test.ts`
- `tests/e2e/troca-de-organizacao-tem-volta.spec.ts`
- `tests/e2e/vps-fresh-onboarding.spec.ts`

## Limites e preocupações

- O executor não rodou E2E nem prova com WhatsApp/celular real. O root executará no perfil B `tests/e2e/troca-de-organizacao-tem-volta.spec.ts` e `tests/e2e/onboarding-sem-ia.spec.ts`; a fresh com QR real não será repetida sem pareamento.
- A alteração da fresh está limitada ao preflight anterior ao login e é coberta pelo teste AST e pelo matcher Playwright instalado; ela não altera a jornada QR.
- O root executa build, `gov:verify` e `test:db` consolidados depois do FREEZE.
- `.changes/2026-09-10-conexao-sem-ia.md` pertence ao root, permaneceu fora dos commits do executor e era o único arquivo sujo ao encerrar produto/testes.

## Re-review — sequência de recuperação da organização B

Commit do ajuste: `7ad671bd2` — `test(onboarding): percorrer boas-vindas na troca de contexto`.

O re-review identificou que a sequência esperada de B ainda precisava concluir `welcome`; exigir `/setup-ai` imediatamente contrariava o guard legítimo de `SetupAiPage`. A adoção efetiva do contexto B pela tela aguarda a reexecução E2E isolada. A prova foi ajustada para percorrer somente os controles reais e a ordem do roteador:

1. mantém o conflito A→B, a medição a 390 px e a prova de zero patch/auditoria em B;
2. clica `Recarregar esta etapa` e exige `/onboarding/welcome`;
3. marca o checkbox e clica `Continuar`, exigindo `/onboarding/connect-whatsapp`;
4. abre `Configurar IA (opcional)` e confirma o rascunho `Nome exclusivo B`;
5. adia a IA e exige retorno a `/onboarding/connect-whatsapp`, pois B segue sem conexão;
6. preserva as provas de `skipped`, auditoria `+1`, rascunho inalterado e retorno posterior a A.

Nenhuma marca de onboarding foi inserida diretamente, nenhum timeout foi ampliado e nenhum arquivo de produto, banco ou outra spec foi alterado.

Verificações do ajuste:

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm eslint tests/e2e/troca-de-organizacao-tem-volta.spec.ts
```

Resultado: exit `0`, sem saída.

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm typecheck
```

Resultado: exit `0`; `tsc --noEmit -p tsconfig.typecheck.json`.

```bash
git diff --check
```

Resultado: exit `0`, sem saída.

A rodada E2E R4 anterior não valida nem invalida esta linha específica: terminou exit `1` com `5 failed / 4 passed / 2 skipped / 10 not run` em aproximadamente 6,5 minutos, incluindo 504 e statement timeouts. A falha real de `troca-de-organizacao-tem-volta` nessa rodada ocorreu antes do novo recovery (esperava `welcome`, recebeu `/app/inbox`); o finding da antiga linha 321 veio do re-review do código. A reexecução isolada do E2E corrigido fica com o root depois do gate de banco.
