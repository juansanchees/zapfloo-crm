# Pull do PostgREST no gate de invariantes

> Execução inline, no worktree existente de codex/altura-shell; PR #7.

**Goal:** preparar a imagem antes de executar todos os invariantes, sem skips.
**Architecture:** opção (a), um passo Bash no job invariants, com cinco tentativas
e backoff 10/20/40/80s. O helper continua usando a mesma imagem do ECR e o cache
local do daemon. Esgotar tentativas reprova explicitamente; teto do passo 5min.
**Tech Stack:** GitHub Actions/Ubuntu, Docker, Bash, Vitest, Node 22/Corepack.
**Spec:** pedido “CONSERTO DO GATE”, nesta tarefa. Sem merge/deploy, sem trocar
registro, sem cache persistente, sem alterar os invariantes de domínio.

## Uma tarefa: preparação fail-closed

Arquivos: `.github/workflows/ci.yml` (passo antes de test:db),
`tests/db/postgrest-local.ts` (somente cabeçalho explicativo) e
`tests/unit/ci-postgrest-pull.test.ts` (executa o Bash real extraído do workflow,
com registro e relógio dublados).

- [x] Confirmar o job 102966569171: rate limit, 165/167 arquivos; 13 casos não
  executados porque o setup dos dois arquivos falhou.
- [x] Criar teste de sucesso imediato, dois rate limits recuperados e esgotamento.
  `corepack pnpm exec vitest run tests/unit/ci-postgrest-pull.test.ts --reporter=verbose`:
  três falhas por ausência do passo de preparação (exit 1).
- [x] Implementar `for tentativa in 1 2 3 4 5`; `if docker pull "$imagem"; then
  exit 0; fi`; esperar somente entre tentativas; terminar com `exit 1`.
- [x] Reexecutar o teste e os gates do workflow; sabotar removendo retentativas
  e convertendo esgotamento em sucesso, confirmar vermelho e restaurar.
- [x] Executar typecheck/lint e suíte unitária.
- [ ] Commit/push na branch existente,
  aguardar o job invariants desse SHA e registrar o rodapé dos 167 arquivos.

## Razão da escolha

Não se troca o artefato do helper nem se acrescenta autenticação ou cache
persistente. O erro é no download em cache frio, antes do PostgREST iniciar.
O download preparado reutiliza a política padrão `docker run --pull=missing`.
Se o registro continuar indisponível, o passo reprova: não converte ausência
da prova de banco em verde. As opções (b)/(c) não são adicionadas a este lote.

## Escopo e Sistema Vivo

Entrada: registro público; saída: cache do daemon consumido pelos dois testes.
Log/porta: passo explícito no job invariants, com tentativas e erro terminal.
Anti-morte: limite de cinco tentativas/5min, sem loop infinito nem skip.
Configuração: workflow versionado; sem env de operador. IA↔humano e atividade de
domínio não se aplicam a uma preparação de CI. Retorno: teste de retentativa e
job completo. Sem nova aresta de arquitetura de produto, UI, schema ou migration.
Sem fragmento em .changes: não há efeito operacional na VPS; só infraestrutura
do gate. O cabeçalho do helper registra a decisão para evitar troca regressiva.

## Medição final

- `corepack pnpm gov:verify` com Node 22.23.2: exit 0; typecheck e gates de lint
  passaram (ESLint: 0 erros, 310 avisos existentes); suíte unitária completa:
  **749 arquivos / 7.872 testes passaram**, 309,94s no Vitest. Medido no worktree
  `codex/altura-shell`, não no checkout principal.
- Revisão independente: nenhum finding acionável; execução separada confirmou
  os três testes do pull verdes.
- Prova direcionada: quatro arquivos, 28 testes passaram (exit 0), incluindo
  `ci-postgrest-pull`, `preambulo-do-ci-nao-come-o-relogio`,
  `workflows-tem-permissions` e `gatilho-dos-jobs-de-entrega`.
- Sabotagem sem retentativas: dois testes falharam (exit 1).
- Sabotagem convertendo esgotamento em sucesso: um teste falhou (exit 1).
- Restauração: os três testes do pull passaram (exit 0). Nenhuma sabotagem ficou
  no código. O teto de 5min pode encerrar um download lento antes da quinta
  tentativa; isso reprova o job, nunca libera invariantes sem a imagem.

O SHA, a URL e o rodapé do CI serão registrados no PR #7 após o push. Verde local
do teste de backoff não substitui os 167 arquivos de invariantes no runner.
