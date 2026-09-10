# Gate completo local — 10/09/2026

Checkout: `.worktrees/jornada-p0`, não o checkout principal. Node22 e
`COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096`.

Comando: `corepack pnpm gov:verify > /tmp/zapfloo-p0-gov-final-r2.log 2>&1`.
O processo terminou com **exit 0**. Fonte no início: `c407b3525` mais as mudanças
da Task3, incluindo comentário neutro em skipWhatsapp.ts. Nenhuma alteração de
schema foi feita nesta leva.

- typecheck: passou.
- ESLint: 0 erros, 310 avisos, mesma contagem da base. Não foi reportado como
  “zero avisos”.
- lint:channels: 62 arquivos de dívida conhecida, nenhum novo.
- lint:role-rank: passou.
- test:unit, script completo `vitest run`, não apenas tests/unit: **753 arquivos
  passaram; 7.909 testes passaram**. Duração da fase Vitest: **308,18s**.

O rodapé do Vitest e o exit code real foram conferidos separadamente. A tentativa
anterior foi vermelha por uma menção ao provider no comentário novo e parou antes
dos unitários; não é a rodada usada como prova.

Isto não é o check remoto verify e não inclui test:db/e2e. O banco tem sua medição
própria em test-db.md. E2E e pareamento têm evidências separadas. A execução fresca
positiva não havia acontecido quando este arquivo foi escrito.

## Reexecução após hardening do harness

`corepack pnpm gov:verify > /tmp/zapfloo-p0-gov-final-r3.log 2>&1` terminou
**exit 0**: **754 arquivos / 7.912 testes passed**, duração Vitest **551,59s**.
Typecheck e três lints passaram; ESLint permaneceu em 0 erros/310 avisos.

A coleta desta rodada antecedeu a criação da regressão adicional de preflight
do fix round 2. Esse teste não está incluído em 7.912; sua prova dirigida deve
ser conferida no relatório correspondente. Nenhum destes números é medição
do checkout principal ou do CI remoto.

## Consolidado final incluindo preflight

`corepack pnpm gov:verify > /tmp/zapfloo-p0-gov-final-r4.log 2>&1` terminou
**exit 0**: **755 arquivos / 7.913 testes passed**, duração Vitest **343,03s**.
Typecheck e lints passaram, mantendo 0 erros/310 avisos. Esta rodada inclui a
regressão nova de preflight. Produto/testes em `af20e4b27`, com documentação de
evidência do root em andamento. Nenhum teste de banco, E2E ou CI remoto está
implicitamente incluído nesse comando.
