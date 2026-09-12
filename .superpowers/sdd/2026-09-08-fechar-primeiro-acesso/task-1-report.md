# Task 1 — contrato transacional de revisão e ativação restrita

## Status

`DONE` — contrato implementado, auto-revisado e verificado. Nenhuma UI foi alterada.

## Delta após revisão independente

- Metadata do canal agora falha fechada nos caminhos inicial e de retry quando qualquer chave está ausente, `null`, com tipo inválido, lista vazia ou telefone fora de E.164. A correção é a migration nova 0225; a 0224 aplicada não foi editada.
- A action reproduz a precedência canônica: credencial explícita da versão, credencial ativa/validada mais recente da organização e só então chave da instalação. O banco revalida a disponibilidade; nenhum boolean ou ID aceito vem do browser, e `credential_id=null` permanece inalterado na versão.
- Retry reconstrói o snapshot anterior à publicação, compara seu SHA-256 com o recibo e verifica os campos canônicos do recibo e do audit. Alteração de versão, recibo ou audit retorna `activation_conflict` sem sobrescrever evidência.

| Prova do delta | Resultado | Log |
| --- | --- | --- |
| RED action focado | 1 falha esperada, 8 passes; credencial org não consultada | `/tmp/onboarding-roxo-review-unit-red.log` |
| RED DB focado | 10 falhas esperadas, 22 passes; metadata ausente, fallback BYOK e integridade do retry | `/tmp/onboarding-roxo-review-db-red.log` |
| GREEN action final | 9/9, exit 0 | `/tmp/onboarding-roxo-review-unit-final.log` |
| GREEN DB final | baseline install/update + 32/32, exit 0 | `/tmp/onboarding-roxo-review-db-final.log` |
| Migration 0225 no Supabase local autorizado | exit 0 | `/tmp/onboarding-roxo-review-migration-0225-final.log` |
| Typecheck final | exit 0 | `/tmp/onboarding-roxo-review-typecheck-final.log` |
| Lint focado final | exit 0 | `/tmp/onboarding-roxo-review-lint-final.log` |
| Mapa de arquitetura | 100/100, exit 0 | `/tmp/onboarding-roxo-review-map.log` |
| Migration 0225 contida textualmente no baseline uma vez | exit 0 | `/tmp/onboarding-roxo-review-baseline-exact-final.log` |

A primeira tentativa GREEN do DB parou antes dos testes (exit 3) por um `+` literal na primeira linha do apêndice do baseline; a causa foi corrigida textualmente e a repetição final passou. Evidência: `/tmp/onboarding-roxo-review-db-green.log`. A assinatura da RPC não mudou, portanto os tipos gerados não exigiram nova geração. A evidência anterior não persistida em arquivo continua nas sessões `49631` (DB focado final) e `84257` (DB completo: 1.319 passes, 1 skip, 423,99 s, exit 0); nenhuma suíte antiga foi repetida para fabricar log.

## Contrato e decisões

- `confirmarAgenteRevisado` revalida contexto, revisão, versão, run, snapshot, `llm_calls` e revisão corrente; grava `reviewed_draft_v2` e audit mínimo sem publicar, vincular ou ativar.
- `ativarAgenteParaTeste` é a única ação deste lote que publica. Requer sessão da mesma organização, não arquivada, `WORKING`, `ai_gate=allowlist`, `ai_gate_mode=pre_go_live` e allowlist E.164 não vazia.
- A capacidade de chave da instalação é calculada somente na action, pelo resolvedor canônico e pelo provider relido da versão persistida. O browser não fornece provider, credential, status, metadata nem o boolean.
- A RPC preserva configuração/modelo ensaiados, agente default e demais canais; publica exatamente a versão preparada e ativa o mesmo agente. Não chama IA, ferramentas, HTTP, WAHA, mensagem ou `event_log`.
- Retry usa o recibo histórico `ai.restricted_activation`, pois publicar invalida corretamente o validator de draft. Retry igual não duplica audit; alteração posterior em agente/canal falha e não é sobrescrita.
- RPCs `SECURITY INVOKER`, executáveis somente por `service_role`; `PUBLIC`, `anon` e `authenticated` revogados.
- Estado legado continua parseável; marcador e recibo são aditivos.

## Arquivos

- Actions/contratos: `app/actions/onboarding/concluir.ts`, `lib/onboarding/concluir.ts`, `lib/schemas/onboarding.ts`.
- Banco: migrations `0224_onboarding_concluir_restrito` e `0225_onboarding_concluir_fail_closed`, `supabase/baseline.sql`, `supabase/migrations/MANIFEST.md`, `lib/database.types.ts`.
- Provas: `tests/unit/onboarding-concluir-action.test.ts`, `tests/invariants/onboarding-concluir.test.ts`.
- Produto/arquitetura: `.changes/2026-09-08-onboarding-conclusao-restrita.md`, `docs/architecture/onboarding-ativacao-restrita.architecture.json`, `docs/architecture/README.md`.

## RED / GREEN e logs reais

| Etapa | Evidência | Exit |
| --- | --- | --- |
| RED action | `pnpm exec vitest run tests/unit/onboarding-concluir-action.test.ts --reporter=verbose` — 6 falhas, 1 passe, antes da implementação | 1 |
| RED DB | `bash scripts/test-db.sh tests/invariants/onboarding-concluir.test.ts --reporter=verbose` — 17 falhas por RPC ausente | 1 |
| GREEN action final | mesmo comando — 1 arquivo, 8/8 | 0 |
| GREEN DB focado final | mesmo harness — baseline install/update verdes, 1 arquivo, 18/18 | 0 |
| Mutação | teste remove em transação a recusa de allowlist vazia, prova aceitação indevida e faz rollback; a recusa volta após rollback | 0 dentro do DB focado |
| Concorrência | duas ativações simultâneas convergem ao mesmo recibo e a um único audit | 0 dentro do DB focado |
| DB completo | `pnpm test:db` — baseline install/update verdes; 162 arquivos, 1.319 passes, 1 skip | 0 |
| TypeScript | `pnpm typecheck` | 0 |
| Lint focado | `pnpm exec eslint app/actions/onboarding/concluir.ts lib/onboarding/concluir.ts lib/schemas/onboarding.ts tests/unit/onboarding-concluir-action.test.ts tests/invariants/onboarding-concluir.test.ts` | 0 |
| Mapa | `pnpm exec vitest run tests/unit/mapas-de-arquitetura.test.ts --reporter=verbose` — 100/100 | 0 |
| Migration local | `docker exec -i supabase_db_zapfloo-onboarding-e2e psql -v ON_ERROR_STOP=1 ...` no projeto `/tmp/zapfloo-onboarding-e2e.KooVaP` | 0 |
| Tipos | `supabase gen types typescript --local --workdir /tmp/zapfloo-onboarding-e2e.KooVaP --schema public,graphql_public,storage`; comparação com arquivo final | 0; `cmp` 0 |
| Whitespace | `git diff --check` | 0 |

O skip do DB completo é preexistente e explícito: `tests/invariants/webhooks-inbound.test.ts:539`, rate limit 429 coberto pelo unitário do fallback em memória. Avisos observados: Vite `configLoader: native`, `wal_level` insuficiente no Postgres efêmero e mensagens de env ausente no unitário; são avisos conhecidos, sem falha. Erros SQL impressos pelo DB completo eram sondas negativas esperadas de RLS/constraints.

Incidentes transparentes: a primeira tentativa focada não encontrou `vitest` por PATH incompleto; repetida com `$PWD/node_modules/.bin`. O CLI 2.83 recusou `db query --file` multi-statement (`SQLSTATE 42601`) antes de executar; a aplicação local foi refeita com `psql`/`ON_ERROR_STOP`. Uma expectativa intermediária esperava erro especializado para credencial revogada, mas o validator canônico 0223 recusa antes com `draft_credential_unavailable`; o validator não foi relaxado.

## Limites e preocupações

- UI/E2E não pertencem à Task 1; a próxima tarefa deve chamar estas actions sem enviar campos confiáveis do servidor.
- A ativação entregue é deliberadamente restrita; liberar público continua fora deste contrato.
- `database.types.ts` ganhou 561 linhas pela geração dos três schemas: as duas RPCs e o schema `storage` anteriormente omitido. Nenhuma edição manual foi feita no arquivo gerado.
- Nenhum push, merge, GitHub, Actions, VPS, deploy, reset de volumes, mensagem real ou leitura de `.env*` foi realizado.
