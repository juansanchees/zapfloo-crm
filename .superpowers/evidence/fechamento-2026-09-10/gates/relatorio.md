# Tarefa 2 — isolamento dos gates locais

Medição em 10/09/2026, checkout `codex/gates-local`, base `22620d85b4023e9975d7dbfd673e9b8bd9393b96` de `juansanchees/zapfloo-crm`. Correções locais, ainda sem commit/push/PR. Nenhuma alteração de produção, VPS, banco ou credencial.

## Alterações

- `eslint.config.mjs`: ignora `.worktrees/`, preservando a exclusão antiga.
- `vitest.config.ts`: ignora `**/.worktrees/**`; exclui e2e, invariants e journeys também quando aninhados.
- `tests/unit/namespace-das-imagens.test.ts`: grep exclui `.worktrees`; teste com fixture confirma que um arquivo novo do checkout próprio continua sendo detectado.
- `tests/unit/escopo-dos-gates.test.ts`: testa a API real do ESLint e a descoberta real do Vitest. A descoberta usa `list --filesOnly --json`, sem executar fixtures/seeds.

Os outros quatro testes citados foram inspecionados: `sem-marcador-de-conflito` usa `git ls-files`; `knobs-da-versao-publicada-sao-aplicados` usa `git grep` com áreas explícitas; `i18n-a-data-segue-o-idioma` ignora diretórios ocultos; `telas-sem-dado-de-mentira` parte de `app/app`. Não foi necessário alterar seus scanners. Foram conferidos também os usos de `excluiDir`, `--exclude-dir` e `execFileSync` em testes.

## Validação

Runtime das medições completas: Node 22.23.2, pnpm 9.15.9. Node 22 está declarado em `.nvmrc`. Binário temporariamente selecionado pelo PATH, sem mudar o Node global (24.11.1).

| Verificação | Resultado medido | Log |
|---|---|---|
| `time corepack pnpm lint` | exit 0; 63,59 s; 0 erros, 310 warnings | `lint.log` |
| `corepack pnpm test:unit --maxWorkers=6 --reporter=verbose` | exit 0; 335,48 s; 702 arquivos; 7.544 aprovados + 1 expected fail (7.545) | `unit-full.log` |
| Ocorrências de `worktrees` no log completo | 0 | `unit-full.log` |
| Marcadores `FAIL` no log completo | 0 | `unit-full.log` |
| `corepack pnpm typecheck` | exit 0 | `typecheck.log` |
| Novo teste + cinco arquivos citados, após restauração | exit 0; 6 arquivos, 33 testes | `restaurado.log` |
| `git diff --check` | exit 0 | conferido no terminal |

A suíte completa não foi limitada a `tests/unit`: o comando usa o script integral, somente limitando concorrência. Durante lint e suíte completa havia uma canária descartável dentro de `.worktrees/sonda-gates`, com erro de lint, throw no carregamento e namespace proibido. Nenhum desses vazamentos atingiu o checkout pai. A canária foi removida depois da medição.

## Prova de regressão e sabotagem

Antes da correção, os três testes de regressão falharam (`gates-red.log`); depois, passaram (`gates-green.log`). Após a suíte completa verde, removi somente `**/.worktrees/**` de `vitest.config.ts` e rodei o teste de descoberta: exit 1, um teste vermelho. Ele coletou dois unitários alheios, totalizando cinco arquivos em vez de três (`sabotagem-vitest.log`). Recoloquei a exclusão e rodei novamente os seis arquivos: 33 testes verdes (`restaurado.log`). Nenhuma sabotagem permaneceu.

## Leads: investigação, sem correção da rota

| Runtime / ambiente Vitest | Mesmos 14 casos de `leads-import-route` |
|---|---|
| Node 22.23.2 / jsdom | 14 passam (`leads-node22-before.log`) |
| Node 24.11.1 / jsdom | 11 falham, 3 passam (`leads-node24-before.log`) |
| Node 24.11.1 / node | 14 passam (`leads-node24-node-env.log`) |

O 422 observado informa `Envie o arquivo como multipart/form-data.` (`leads-node24-resposta.log`). Essa resposta vem do catch em torno de `req.formData()`, antes de `pareceArquivo`. Uma sonda mínima com multipart real reproduziu no Node 24 + jsdom a asserção interna do undici `webidl.is.File(value)` durante o parsing (`arquivo-node24.log`); no Node 22 + jsdom passou (`arquivo-node22.log`).

Conclusão medida: incompatibilidade na combinação Node 24 / jsdom / parsing multipart do undici, não reprovação da checagem por forma na rota. O mecanismo exato de troca de construtores entre realms não foi completamente rastreado. Não alterei `pareceArquivo`, não introduzi `instanceof` nem modifiquei o teste de Leads permanentemente. Usar Node 22 declarado no projeto reproduz o verde; uma eventual compatibilização com Node 24 é trabalho separado.

## Limites e fragmento de release

Não criei `.changes/`: esta entrega só corrige ferramentas/testes locais, sem efeito operacional para quem instala na VPS. Nenhuma capacidade ou ação nova do operador a anunciar.

Não foram executados banco, E2E, build ou deploy: nenhum schema, código de aplicação ou interface foi alterado. Não declaro o projeto livre de bugs nem a suíte completa compatível com Node 24. O log completo verde é de Node 22.

O checkout original permaneceu com somente a alteração pessoal pré-existente em `.codex/config.toml`, de hash SHA-256 `3d25e4c7d9b904c0a919980d9eca52207da8fb8fb9b7bdc828f92956f70ca61e`; o checkout `onboarding-roxo` permaneceu limpo. A correção está apenas no checkout isolado `zapfloo-gates-local`, não aplicada à main.
