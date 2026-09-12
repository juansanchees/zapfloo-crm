# Correções de produção — provas locais, 10/set/2026

## Escopo e identidade

- Branch: `codex/correcoes-producao`, worktree `.worktrees/correcoes-producao`.
- Base: `origin/codex/onboarding-roxo` em `4b9aadafdb6edc2e89eabd9b5960f97250f97aaf`.
- Gates trazidos antes das correções: `dc175239b` → cherry-pick `d0d6a6252`.
- Destino: `juansanchees/zapfloo-crm`, verificado privado nesta execução. Sem PR, merge, deploy ou acesso à VPS.
- Node **22.23.2**, pnpm **9.15.9** por Corepack; `NODE_OPTIONS=--max-old-space-size=4096`.
- Sem alteração de schema: nenhuma migration, alteração de baseline ou MANIFEST.
- `.codex/config.toml` do checkout principal preservado, SHA-256 antes/depois: `3d25e4c7d9b904c0a919980d9eca52207da8fb8fb9b7bdc828f92956f70ca61e`.

## O que foi corrigido

1. O follow-up vinculado a uma conversa aceita indisponibilidade transitória do canal de origem. Usa a fila `messages` existente; o reconciliador faz o resgate. Arquivamento, ausência e canal de outra organização continuam recusados. Não há segunda fila ou política nova de retry.
2. O copiloto por sessão consulta dados com o cliente autenticado, preservando RLS. O ingresso MCP por `api_tokens` mantém seu cliente de integração. A revisão independente identificou uma regressão nos nomes: o resolvedor agora faz uma exceção administrativa restrita a nomes de membros ativos da organização, solicitados a partir das linhas autorizadas. Esse cliente não é exposto às consultas do copiloto; falha de lookup não libera nomes.

Referência primária para a distinção entre os clientes: [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security). A prova deste relatório é a execução local abaixo, não a documentação.

## Resultados e comandos

Comandos executados no worktree desta branch, com Node 22 no PATH. Logs completos preservados, sem truncar a saída do Vitest. Exit codes foram obtidos do processo, não de um `echo` posterior.

| Prova | Comando / log | Resultado medido |
|---|---|---|
| Base antes das correções | `corepack pnpm test:unit` / `baseline-unit.log` | Exit 0; 744 arquivos, 7.829 testes passaram. |
| Follow-up unitário RED | `corepack pnpm exec vitest run tests/unit/followup-canal-arquivado.test.ts` / `followup-unit-red.log` | Exit 1; 3 falhas, 12 passaram. |
| Copiloto unitário RED | `corepack pnpm exec vitest run tests/unit/ai-ask-route.test.ts` / `copilot-unit-red.log` | Exit 1; 1 falha, 4 passaram. |
| Copiloto: vazamento real de linhas | `corepack pnpm test:db tests/invariants/copilot-visibilidade-sessao.test.ts --reporter=verbose` / `copilot-db-red.log` | Exit 1; 2 falhas, 4 passaram. GET retornou zero/uma conversa; copiloto retornou três. |
| Dois consertos: primeiro verde de banco | `corepack pnpm test:db tests/invariants/copilot-visibilidade-sessao.test.ts tests/invariants/followup-reconexao.test.ts tests/invariants/followup-canal-origem.test.ts --reporter=verbose` / `db-green.log` | Exit 0; 17/17 passaram. |
| Sabotagem follow-up | `corepack pnpm test:db tests/invariants/copilot-visibilidade-sessao.test.ts tests/invariants/followup-reconexao.test.ts --reporter=verbose` / `db-copilot-red-followup-sabotagem.log` | Exit 1. Os dois positivos de reconexão voltaram a `dead`/5 em vez de `done`/1; três negativos passaram. A fixture do copiloto falhou separadamente e teve seis skips nessa rodada, não é prova dele. |
| Regressão de nomes detectada pelo revisor | `corepack pnpm test:db tests/invariants/copilot-visibilidade-sessao.test.ts --reporter=verbose` / `copilot-nomes-red.log` → `copilot-nomes-green.log` | RED exit 1, 3 falhas/3 passaram; GREEN exit 0, 6/6. Auth Admin substituído por nomes sintéticos somente neste teste; memberships e RLS reais. |
| Limites do resolvedor de nomes | `corepack pnpm exec vitest run tests/unit/mcp-user-names-session.test.ts` / `nomes-guard-red.log`; depois junto de `tests/unit/ai-ask-route.test.ts` / `nomes-guard-green.log` | RED exit 1, 2 falhas/5 passaram; GREEN exit 0, 12/12. IDs extras e metadata não textual não escapam. |
| Sabotagem copiloto | `corepack pnpm test:db tests/invariants/copilot-visibilidade-sessao.test.ts --reporter=verbose` / `copilot-db-sabotagem.log` | Exit 1; 2 falhas/5 passaram. Voltar `createAdminClient()` reproduziu o vazamento; controles positivos, nomes e bearer passaram. Correção restaurada. |
| Gate completo | `corepack pnpm gov:verify` / `gov-verify.log` | Exit 0; 745 arquivos, 7.842 testes passaram. Lint 312 warnings, zero errors; dois warnings novos eram imports de tipo da fixture, removidos depois. |
| Banco completo | `corepack pnpm test:db` / `test-db.log` | Exit 0; 166 arquivos, 1.362 passaram e 1 skipped; baseline install/update passou. Duração Vitest 475,90 s. |
| Banco após ajuste só de imports de tipo | `corepack pnpm test:db tests/invariants/copilot-visibilidade-sessao.test.ts tests/invariants/followup-reconexao.test.ts tests/invariants/followup-canal-origem.test.ts --reporter=verbose` / `db-final-direcionado.log` | Exit 0; 18/18 passaram. Nenhuma mudança de comportamento após o banco completo. |
| Repetição final do gate | `corepack pnpm gov:verify` / `gov-verify-final.log` | Exit 0; 745 arquivos, 7.842 testes passaram, zero FAIL. Typecheck e gates de canais/papéis passaram; lint 310 warnings preexistentes, zero errors e nenhum aviso novo nos arquivos do lote. Duração Vitest 227,31 s. |
| Verificadores que usam `git ls-files`, após registrar todos os arquivos novos | `corepack pnpm exec vitest run` com os nove arquivos listados no cabeçalho de `indice-final.log` | Exit 0; 9 arquivos, 111/111 testes. Inclui conflitos, namespace de imagens, documentação e evidência citada. |

As primeiras rodadas `db-red.log` e `db-copilot-red-followup-green.log` registram erros de construção da fixture do copiloto (campo computado confundido com coluna; canal obrigatório ausente). Não são evidência de falha ou sucesso do copiloto. Permanecem no arquivo de logs para transparência. A rodada seguinte corrigiu também um cast UUID/text da fixture antes do RED válido.

O único skipped do banco completo já existe em `tests/invariants/webhooks-inbound.test.ts:539`: rate limit 429 após estourar a janela. O comentário registra cobertura unitária do fallback in-memory; esse cenário de banco não foi executado e não foi alterado.

## Living System Checklist

| Item | Caminho existente preservado / prova |
|---|---|
| Entrada do follow-up | Enrollment com `conversation_id` → `followup_turn` → handler real. Fixture representa a saída do gatilho; não testa o webhook que o antecede. |
| Estado e executor | Job `done`/1, mensagem e ledger `queued`, enrollment avança. `reconcileSessions` e `redriveQueued` reais reenviam uma vez no canal pinado. |
| Erro visível | Mensagem retida mantém `queued_reason`; canal inválido continua recusado. Teste confirma ausência de `job_dead` na reconexão válida. |
| Visibilidade e auditoria | Inbox/Central existentes não foram redesenhados. Evento de envio e estado persistido foram consultados no banco. Copiloto mantém `consulted_tools`, fontes e chamada de audit existente. O efeito visual/audit do copiloto não foi medido aqui. |
| Configuração e desligamento | Nenhuma configuração, env ou mecanismo de desligamento novo. `archived_at` continua impedindo envio. |
| Integração e isolamento | Mesmos IDs em GET e copiloto para atendentes; positivos para manager/admin; bearer MCP real com token validado preservado; controle de outra organização. |
| Documentação / entrega | Mapa do copiloto atualizado; dois fragmentos `.changes/`. Sem tela ou porta de navegação nova, sem texto novo de interface. |

## Pendências autorizadas do anexo

- **3:** timeout e retries automáticos da interface do copiloto, com possível cobrança repetida.
- **4:** recuperação do rascunho cujo agente preparado foi arquivado/excluído.
- **5:** cadastro de `onboarding_rehearsal` e scanner que reconheça ambos os tipos de aspas.
- **6:** limites compatíveis entre salvar rascunho e preparar o prompt.

Nenhum desses quatro foi alterado nesta leva. O lote priorizou os dois defeitos obrigatórios e suas provas.

## O QUE NÃO FOI MEDIDO

- Produção, VPS e dados reais: nenhum acesso, deploy, reprocessamento ou levantamento de jobs/enrollments já mortos. O patch não ressuscita automaticamente esses trabalhos.
- WhatsApp/WAHA real: o teste usa um receiver HTTP local; não prova entrega no aparelho.
- Processo completo do daemon: usa handler e funções reais da fila, reproduzindo o contrato de settlement e acelerando `run_after` na fixture. Não inicia o daemon inteiro.
- GoTrue, login/cookies no navegador, UX, e2e e build: não executados neste lote backend. A sessão e o lookup de nomes são simulados na fronteira; JWT, PostgREST, RLS, ferramentas e tabelas são reais sobre baseline install/update.
- Modelo de IA pago, comportamento probabilístico, cobrança e geração de texto: substituídos por execução determinística da ferramenta selecionada.
- Audit e rate limit do copiloto: isolados no teste; não são nova prova dessas integrações.
- CI/GitHub Actions: não executado. Sucesso local não é sucesso do CI.

Revisão independente somente leitura: encontrou a perda de nomes, corrigida e testada. Na revisão final do diff não apontou bloqueador remanescente; ambos os gates globais terminaram com exit 0.

## Entrega

Os logs completos estão arquivados em `logs.tar.gz` neste diretório, incluindo falhas intermediárias e sabotagens. Arquivos individuais continuam disponíveis localmente; para examiná-los em outro clone, extraia o arquivo em um diretório temporário.

Commits funcionais separados: `043eb8808` (follow-up e harness de PostgREST) e `d0c5be27a` (copiloto), após `d0d6a6252` (gates). Nenhum WIP no lote obrigatório. A branch depende de `codex/onboarding-roxo` e já incorpora o patch de `codex/gates-local`; revisar integração nessa ordem, sem cherry-pick duplicado dos gates. O push não é deploy e não corrige o código que continua em produção.
