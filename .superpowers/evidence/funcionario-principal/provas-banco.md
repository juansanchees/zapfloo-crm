# Provas de banco — funcionário principal

Ambiente: Node 22.23.2, `corepack pnpm`, Postgres pg15 descartável pelo
`scripts/test-db.sh`. Nenhum banco de produção foi acessado.

## Controle conjunto

```sh
corepack pnpm test:db tests/invariants/onboarding-concluir.test.ts tests/invariants/onboarding-principal-backfill.test.ts tests/invariants/onboarding-principal-restricao.test.ts --reporter=verbose
```

`db-principal-tres-familias-verde.log`: exit 0, 3 arquivos / 38 testes passaram,
baseline INSTALL e UPDATE com ON_ERROR_STOP passaram.

NOTICES reais da matriz de 15 organizações sintéticas:

```text
NOTICE: onboarding_funcionario_principal: promovidas=2, ignoradas_por_default=2, ignoradas_por_falta_de_evidencia=11, defaults_arquivados=1
NOTICE: onboarding_funcionario_principal: promovidas=0, ignoradas_por_default=4, ignoradas_por_falta_de_evidencia=11, defaults_arquivados=1
```

Segunda aplicação sem promoção/auditoria adicional. As duas promoções da
primeira aplicação emitem os dois audits canônicos de ai_agents; nenhum evento
de execução ou envio é criado pelo backfill. Não se altera versão, publicação,
lista de teste, atividade ou arquivamento do candidato.

## Sabotagens da RPC em banco descartável

O shim `bin/vitest` mantém o harness real e muda apenas a config para acrescentar
`mutar-rpc.ts`. O setup substitui a definição da RPC no banco de cada corrida,
sem alterar migration, baseline ou aplicação. O container é destruído no EXIT.

```sh
PATH="$PWD/.superpowers/evidence/funcionario-principal/bin:/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin" ONBOARDING_DB_MUTANT=sem-promocao bash scripts/test-db.sh tests/invariants/onboarding-concluir.test.ts -t 'ativa e promove o funcionário' --reporter=verbose
PATH="$PWD/.superpowers/evidence/funcionario-principal/bin:/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin" ONBOARDING_DB_MUTANT=sem-promocao-retry bash scripts/test-db.sh tests/invariants/onboarding-concluir.test.ts -t 'retry de recibo válido promove' --reporter=verbose
PATH="$PWD/.superpowers/evidence/funcionario-principal/bin:/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin" ONBOARDING_DB_MUTANT=sem-isolamento-unique bash scripts/test-db.sh tests/invariants/onboarding-concluir.test.ts -t 'default criado em concorrência vence' --reporter=verbose
```

- `db-mutante-sem-promocao.log`: exit 1, is_default recebido false em vez de true.
- `db-mutante-sem-promocao-retry.log`: exit 1, somente o ramo de retry perdeu a marca.
- `db-mutante-sem-isolamento-unique-real.log`: exit 1, SQLSTATE 23505,
  constraint `ai_agents_one_default_per_org`, rotina `_bt_check_unique` no UPDATE
  da promoção. A mesma corrida passou no controle conjunto, com o catch intacto.

### Instrumentação da corrida, sem esconder a diferença

A primeira versão da prova observava um bloqueio `transactionid`, mas o mutante
sem catch ainda passava. O bloqueio vinha do FK de auditoria na organização,
antes do índice. Esse verde NÃO foi aceito como prova do catch.

Na versão final, somente a sessão do escritor adversarial usa
`SET LOCAL session_replication_role=replica`: elimina os triggers/FKs incidentais
que serializariam a corrida antes da promoção, **sem desativar o índice único**.
A sessão que executa a ativação mantém todos os guards, triggers e auditoria.
A transação concorrente cria a marca sem confirmar; a ativação aguarda seu
COMMIT; a sabotagem devolve 23505 no índice real. Não há trigger falso que lança
erro nem reimplementação da função testada.

## Sabotagem independente da auditoria no backfill

Janela coordenada: retirado apenas `or not exists (select 1 from
public.api_audit_log audit ...)` do arquivo 0233, sem tocar baseline nem recibos
de fixture. O candidato com recibo/versão/hash íntegros, mas audit ausente,
foi promovido indevidamente. `db-backfill-sem-audit.log`: exit 1.

```text
- onboarding_funcionario_principal: promovidas=2, ignoradas_por_default=2, ignoradas_por_falta_de_evidencia=11, defaults_arquivados=1
+ onboarding_funcionario_principal: promovidas=3, ignoradas_por_default=2, ignoradas_por_falta_de_evidencia=10, defaults_arquivados=1
```

0233 restaurada byte a byte após o vermelho; `git diff --exit-code --
supabase/migrations/20260913190100_0233_onboarding_reparar_funcionario_principal.sql`
retornou 0. Reteste sem mutante: `db-backfill-audit-restaurado.log`.

## Limites e diagnóstico de fixture

- Uma rodada falhou na fixture original com `rehearsal_invalid_result` antes do
  backfill. A repetição passou. Foi acrescentada uma asserção diagnóstica dos
  timestamps para separar problema de semente da correção; a causa não foi
  confirmada, e nenhum timestamp foi manipulado para ocultá-la.
- A prova de transporte está delimitada no teste próprio: receiver HTTP local,
  RPCs reais e fila real; sem celular, LLM real ou jornada completa de inbound.
- As duas jornadas de site e seu mutante são responsabilidade da prova E2E
  separada, não desta suíte de banco.
