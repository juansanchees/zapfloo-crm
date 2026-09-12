# Anexo 6 — evidência do teto exato do prompt

## RED TypeScript

Comando:

`pnpm vitest run tests/unit/onboarding-prompt.test.ts tests/unit/onboarding-rascunho-action.test.ts`

Resultado antes da produção: exit 1; 1 falha e 18 testes verdes. A action
convertia `draft_prompt_too_long` em `db_error`.

## RED PostgreSQL

Comando:

`pnpm test:db tests/invariants/onboarding-draft-save.test.ts tests/invariants/onboarding-draft-prepare.test.ts`

Resultado antes da migration 0229: exit 1; 5 falhas e 34 testes verdes. SAVE
aceitou as três configurações com prompt de 20.001 unidades UTF-16; PREPARE
aceitou 10.000 emojis mais uma unidade. A quinta falha era do fixture do teste,
corrigido antes da produção sem mudar o contrato.

## GREEN

Comandos e resultados:

- `pnpm vitest run tests/unit/onboarding-prompt.test.ts tests/unit/onboarding-rascunho-action.test.ts tests/unit/onboarding-rascunho-form.test.tsx tests/unit/onboarding-preparar-action.test.ts` — exit 0, 35/35.
- `pnpm typecheck` — exit 0.
- `pnpm test:db tests/invariants/onboarding-draft-save.test.ts tests/invariants/onboarding-draft-prepare.test.ts` — exit 0, install e update idempotente do baseline, 39/39.

## Sabotagem

Mutação temporária aplicada tanto à migration 0229 quanto ao apêndice do
baseline: os dois predicados `> 20000` viraram `> 20001`.

O mesmo `pnpm test:db` saiu com exit 1: 4 falhas e 35 testes verdes. Falharam as
três templates em SAVE e a fronteira Unicode em PREPARE. A mutação foi
restaurada para `> 20000`; a repetição final ficou verde, com install/update e
39/39 testes.

## Correção após revisão P2

A revisão detectou que `E'\v'` não representa tab vertical no PostgreSQL e
incluía a letra `v` no conjunto de trim. Antes da correção, dois novos testes
ficaram vermelhos: o SQL apagava um objetivo curto `vvv` e SAVE aceitava um
objetivo longo composto por 20.000 letras `v`.

Migration e baseline passaram a usar o escape octal `\013`. A verificação final
do banco saiu com exit 0: install/update idempotente e 41/41 testes, incluindo
letra `v`, tab vertical, as três templates e a fronteira Unicode.
