# Task 1 — conexão cumprível e progresso independente da IA

Status: **DONE_WITH_CONCERNS**. O comportamento dirigido e todos os arquivos que
falharam na suíte completa foram comprovados verdes, mas a execução única de
`pnpm test:unit` terminou vermelha dentro do sandbox. O motivo e a reconciliação
estão registrados em **Limites da verificação**.

Base conferida antes da implementação: `943b14d4c04b9c29b5ced212dcddacbd997c948c`,
branch `codex/jornada-p0`, worktree isolado e limpo.

## Arquivos da entrega

- `app/actions/onboarding/skipWhatsapp.ts`
  - mantém `markWhatsappConfigured` como escritor do passo;
  - troca status/nome arbitrários do cliente por input estrito contendo apenas o UUID do canal;
  - revalida RBAC/MFA, chama a confirmação server-side, persiste o passo, audita e redireciona.
- `lib/onboarding/confirmar-whatsapp.ts`
  - helper novo para leitura tenant-scoped, recusa de canal arquivado e consulta ao transporte por adapter.
- `lib/onboarding/passos.ts`
  - `connect-whatsapp` passa a depender somente de `state.whatsapp`;
  - adiamento explícito da IA sobrevive à releitura de prova.
- `lib/onboarding/passos.test.ts`
  - cobre conexão sem IA, IA adiada, revisão sem ativação e releitura do adiamento.
- `tests/unit/onboarding-whatsapp-confirmacao-action.test.ts`
  - cobre contrato de entrada, tenancy, RBAC, arquivo, banco, transporte e persistência.
- `.superpowers/sdd/2026-09-10-jornada-p0-correcao/task-1-report.md`
  - este relatório.

O arquivo `docs/superpowers/plans/2026-09-10-jornada-p0-correcao.md` apareceu
modificado por outra sessão durante a execução e não faz parte desta entrega nem
do commit da Task 1.

## Contrato preciso para a UI da Task 2

```ts
markWhatsappConfigured(input: unknown): Promise<
  | { ok: false; error:
      | "auth_required"
      | "no_active_org"
      | "forbidden"
      | "mfa_required"
      | "not_found"
      | "db_error"
      | "invalid_input"
      | "channel_archived"
      | "upstream_unavailable"
      | "invalid_state"
    }
>
```

- Único input aceito: `{ channel_session_id: string UUID }`.
- O schema é `strict`: `status`, `organization_id`, `session_name` ou qualquer
  outro campo enviado pelo navegador resultam em `invalid_input` antes do banco.
- O UUID deve vir de uma resposta/lista tenant-safe já existente. A action não
  aceita nome de sessão.
- `requireOnboardingCtx()` revalida admin e MFA. O `organization_id` usado na
  leitura e na escrita vem apenas desse contexto.
- A leitura usa service role com os dois filtros explícitos:
  `organization_id = ctx.orgId` e `id = channel_session_id`.
- Canal de outro tenant é devolvido como `not_found`, sem revelar sua existência.
- Canal com `archived_at` é recusado com `channel_archived` antes do transporte.
- Provider e referência de sessão vêm da linha persistida. A action chama
  `getAdapter(provider).checkHealth({ organizationId, sessionRef })`.
- Somente `{ reachable: true, status: "WORKING" }` conclui. `STARTING`,
  `SCAN_QR_CODE`, `FAILED`, `STOPPED` ou status vazio retornam `invalid_state`.
  Transporte inalcançável, adapter sem health check ou exceção retornam
  `upstream_unavailable`.
- Para QR, o DB pode continuar `STARTING`: o WAHA adapter chama `getSessionQr`,
  e o `WORKING` ao vivo é a prova que vale.
- Canal oficial e parceiro usam seus adapters existentes; nenhum deles depende
  de agente, credencial de IA ou `restricted_activation`.
- Sucesso persiste exatamente
  `whatsapp: { channel_session_id, status: "WORKING" }`, preservando os demais
  campos de `onboarding_state`, emite `onboarding.whatsapp_configured` com o UUID
  como `resourceId` e chama `redirect("/onboarding")`. Por isso não existe DTO de
  sucesso retornado à UI: a navegação é o desfecho positivo.
- A Task 2 precisa mapear os códigos acima para texto localizado. Nenhuma string
  visível/i18n foi adicionada nesta Task 1.

## TDD e sabotagem

### RED inicial

Comando:

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm vitest run tests/unit/onboarding-whatsapp-confirmacao-action.test.ts lib/onboarding/passos.test.ts
```

Exit `1`.

```text
Test Files  2 failed (2)
Tests  11 failed | 13 passed (24)
```

Falhas esperadas: action antiga não consultava tenant/canal/transporte e aceitava
status do cliente; o roteador devolvia `connect-whatsapp` para IA revisada sem
ativação restrita.

### GREEN inicial

Mesmo comando. Exit `0`.

```text
Test Files  2 passed (2)
Tests  24 passed (24)
```

### RED do adiamento persistido

Após acrescentar o caso `flow=reviewed_draft_v2` + `skipped=true` sem prova
corrente:

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm vitest run lib/onboarding/passos.test.ts
```

Exit `1`.

```text
Test Files  1 failed (1)
Tests  1 failed | 15 passed (16)
```

Falha esperada: `progressoRevisado` apagava `state.ai` e reabria o passo de IA.

### Sabotagem obrigatória da escrita de WhatsApp

Foi removida temporariamente somente a chamada a `patchOnboardingState` e rodado:

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm vitest run tests/unit/onboarding-whatsapp-confirmacao-action.test.ts
```

Exit `1`.

```text
Test Files  1 failed (1)
Tests  2 failed | 7 passed (9)
```

Os dois positivos falharam porque `onboarding_state.whatsapp` permaneceu ausente.
O bloco foi restaurado com `apply_patch` e o conjunto dirigido voltou a:

```text
Test Files  2 passed (2)
Tests  25 passed (25)
```

### RED adicional da abertura do cliente privilegiado

Com o mock de `createAdminClient` lançando:

```text
Test Files  1 failed (1)
Tests  1 failed | 9 passed (10)
```

A action rejeitava a Promise. Após o ajuste, a falha vira `{ ok:false,
error:"db_error" }` sem banco, transporte, audit ou redirect.

## Verificação final

### Testes dirigidos + gate de consulta centralizada

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm vitest run tests/unit/onboarding-whatsapp-confirmacao-action.test.ts lib/onboarding/passos.test.ts tests/unit/canais-selecionaveis.test.ts
```

Exit `0`.

```text
Test Files  3 passed (3)
Tests  34 passed (34)
```

### Typecheck

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm typecheck
```

Exit `0`; `tsc --noEmit -p tsconfig.typecheck.json` sem diagnóstico.

### ESLint focado

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm exec eslint app/actions/onboarding/skipWhatsapp.ts lib/onboarding/confirmar-whatsapp.ts lib/onboarding/passos.ts lib/onboarding/passos.test.ts tests/unit/onboarding-whatsapp-confirmacao-action.test.ts
```

Exit `0`, saída vazia.

### Suíte completa única

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm test:unit > /tmp/task1-test-unit.log 2>&1
```

Exit `1`.

```text
Test Files  5 failed | 746 passed (751)
Tests  10 failed | 7856 passed | 27 skipped (7893)
Errors  8 errors
```

Reconciliado no log integral:

- `tests/unit/canais-selecionaveis.test.ts`: falha atribuível à Task 1. A leitura
  direta em `app/actions` violava o gate. Foi extraída para
  `lib/onboarding/confirmar-whatsapp.ts`; o arquivo passou no gate dirigido final.
- `lib/waha/client.test.ts` e `lib/automation/actions/call-webhook.test.ts`:
  `listen EPERM: operation not permitted 127.0.0.1` dentro do sandbox.
- `tests/unit/channel-adapter-zernio.test.ts`: `unsafe_url:dns_failed` dentro do sandbox.
- `tests/unit/import-puro-sem-env.test.ts`: o processo `tsx` não chegou a executar
  por `listen EPERM` do ambiente de sandbox.

Somente as quatro famílias ambientais foram repetidas fora do sandbox, sem
repetir a suíte completa:

```bash
PATH=/tmp/zapfloo-corepack.wMswWn:/Users/juansanches/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm vitest run lib/waha/client.test.ts lib/automation/actions/call-webhook.test.ts tests/unit/channel-adapter-zernio.test.ts tests/unit/import-puro-sem-env.test.ts
```

Exit `0`.

```text
Test Files  4 passed (4)
Tests  63 passed (63)
```

## Revisão de segurança e estado

- Tenancy: UUID externo nunca define tenant; leitura privilegiada filtra tenant e canal.
- RBAC/MFA: revalidados antes de abrir service role.
- Arquivamento: canal arquivado para antes de qualquer consulta ao transporte.
- Estado confiável: DB localiza; adapter confirma ao vivo; browser não prova status.
- Falha fechada: erro de cliente/consulta/provider/referência/transporte não grava nem avança.
- IA: nenhuma leitura ou mutação de agente/política/ativação na confirmação do canal.
- Persistência: patch estreito preserva estado anterior e teste relê o objeto resultante.
- Auditoria: somente após persistência bem-sucedida; falhas não emitem sucesso.
- Laço de retorno: códigos de erro mantêm o usuário no passo; sucesso volta ao roteador.

## Limites da verificação

- Não houve UI, E2E, banco real, schema, migration, deploy, PR, push ou VPS nesta Task 1.
- A prova visual/WAHA real e a obtenção do UUID pela UI pertencem às Tasks 2–4.
- `pnpm test:db` não foi executado porque não houve mudança de schema/RLS e o brief
  desta worker pediu testes dirigidos + suíte unitária. A coordenação raiz mantém
  os gates integrais da entrega consolidada.
- A suíte completa não foi repetida depois do conserto do único arquivo atribuível
  à Task 1, conforme a instrução de executá-la uma vez. O gate corrigido e as quatro
  famílias ambientais foram executados separadamente e passaram.
- Nenhum arquivo `.env*`, `.codex/config.toml` ou
  `.superpowers/fresh-p0-correcao/runtime.json` foi lido ou alterado.
