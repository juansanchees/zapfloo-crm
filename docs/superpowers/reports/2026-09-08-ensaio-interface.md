# Task 1 — Ensaio integrado

**Resultado: DONE_WITH_CONCERNS.** Fluxo integrado e gates aprovados; limites de prova e avisos observados abaixo. Não declara o produto inteiro livre de bugs.

## Escopo entregue no código

`setup-ai` salva rascunho, exige modelo explícito, prepara versão inativa/sem canal, ensaia texto pelo seam canônico e registra revisão separada. O painel nunca está dentro de um form de criação/publicação; Enter não chama o legado.

DTO central Zod projeta e congela snapshot. RPCs service-only invoker validam org/membership/admin, revisão, negócio, agente e versão completa antes/depois da rede. Resultado exige llm_calls da mesma org/agent/provider/model/purpose e posterior ao início. Alteração de configuração/preparação invalida prova; versão/negócio alterados são recusados em leitura/conclusão/revisão. Revisão repetida gera um audit.

Extensões pequenas autorizadas: `selectionMode: explicit`, timeout/output opcionais em runModelCall e strictCredential em credentials. Defaults anteriores preservados; ID explícito sem chave válida não cai em fallback. Null continua representando credencial disponível do provedor (org/instalação), sem promessa de chave existente.

## RED/GREEN observados (logs completos locais)

- `/tmp/ensaio-db-red.log`: exit 1, 13 falhas por RPC ausente, após corrigir fixture inicialmente inválido.
- `/tmp/ensaio-db-green.log`: exit 0, 13 invariantes; baseline install/update com ON_ERROR_STOP.
- `/tmp/ensaio-seam-green.log`: exit 0, 10 testes. RED anterior mostrou binding trocando openai/modelo escolhido por anthropic/binding, limite 9000 em vez de 1200, fallback indevido de credencial ausente.
- `/tmp/ensaio-adapter-red.log`: exit 1, módulo adapter ausente. `/tmp/ensaio-adapter-green.log`: exit 0, 6 testes SDK sintético (sem tools, vazio/truncamento/chave ausente).
- `/tmp/ensaio-actions-ui-red.log`: exit 1, actions/painel ausentes. `/tmp/ensaio-actions-ui-green.log`: exit 0, 15 testes em 3 arquivos, incluindo rascunho legado.
- `/tmp/ensaio-inflight-red.log`: exit 1, segunda chamada em andamento indevidamente aceita; 13 anteriores verdes. `/tmp/ensaio-limit-red.log`: exit 1, limite não barrava chamada.
- `/tmp/ensaio-db-final-target.log`: exit 0, 16 invariantes, incluindo lease/retry, credencial de outro tenant/provider e mutação SQL real. A mutação remove comparação completa de snapshot numa transação, passa a aceitar revisão antiga, e rollback restaura recusa; nenhum SQL mutado permanece.
- `/tmp/ensaio-unit-green.log`: exit 0, 17 testes dos 3 arquivos novos.
- Revisão visual encontrou descrição da credencial cortada no select. `/tmp/ensaio-credential-help-red.log`: exit 1 (1 falha/2 verdes) por descrição acessível ausente. Ajuda quebrável fora do select com `aria-describedby`; `/tmp/ensaio-credential-help-green.log`: exit 0, 8 testes UI+i18n. Sem mudança de seleção/credencial.
- `/tmp/ensaio-typecheck.log`: exit 0 (checagem intermediária).
- `/tmp/ensaio-lint.log`: exit 0, 0 erros/313 avisos nessa rodada intermediária; um aviso novo de import type foi removido depois. Avisos prévios do repositório não foram suprimidos.

## Gates completos e evidência visual

Executados sequencialmente; a revisão visual motivou uma repetição de build/E2E após a suíte completa.

- `pnpm gov:verify`: **exit 0**, typecheck sem erros, lint 0 erros/312 avisos herdados, lint:channels e lint:role-rank verdes, **711 arquivos/7635 testes unitários passaram**. Log completo `/tmp/ensaio-gov-verify.log`. A primeira tentativa parou em lint:channels por nome de canal num comentário do adapter; comentário trocado por “canais”, sem allowlist. i18n detectou `Aguarde…` sem ES numa rodada alvo e a entrada foi adicionada antes da suíte completa.
- `pnpm test:db`: **exit 0**, baseline install/update sem erro, **161 arquivos; 1301 passaram e 1 skipped (1302 casos)**. Árvore DB permaneceu estável. Log `/tmp/ensaio-db-full.log`; erros SQL de casos negativos são esperados, rodapé/exit confirmam aprovação.
- `pnpm e2e:build`: **exit 0**, compilação/TypeScript/rotas concluídos, controle positivo confirmou `127.0.0.1:54321` no bundle. Log `/tmp/ensaio-e2e-build.log`. Aviso existente de depreciação Sentry withSentryConfig permanece.
- `pnpm test:e2e tests/e2e/troca-de-organizacao-tem-volta.spec.ts`: **exit 0**, **4 passed (47.5s)** sem chave/helper. Erro honesto sem chave, seleção retomada, rascunho/duas abas/duas organizações e guards de convidado/admin/exploração passaram. Log `/tmp/ensaio-e2e-sem-chave.log`.
- E2E adicional sintético, opt-in e filtro `ensaio explícito`: **exit 0, 1 passed (10.3s)**, `/tmp/ensaio-e2e-sintetico.log`. SDK real recebeu HTTP local Responses; receiver recebeu **1** chamada com modelo escolhido e sem tools. Revisão/refresh passaram; alteração em outra aba recusou tentativa antiga e manteve contagem 1.
- Build após ajuste de ajuda: **exit 0**, `/tmp/ensaio-final-e2e-build.log` (inclui TypeScript e controle do host local no bundle).
- E2E final após ajuda: sem chave **exit 0, 4 passed (1.1m)** em `/tmp/ensaio-final-e2e-sem-chave.log`; sintético **exit 0, 1 passed (10.6s)** em `/tmp/ensaio-final-e2e-sintetico.log`. Repetiu seleção/preparação/revisão e isolamento; nenhum gate pesado concorrente.
- `pnpm release:conferir`: **exit 0**, `/tmp/ensaio-release-conferir.log`; somente conferência, não cortou release nem consumiu fragmentos.
- Revisão independente coordenada pelo agente pai: nenhuma falha acionável confirmada na revisão de código. Ajuste visual acima incorporado.

Capturas do painel completo, inspecionadas em desktop e viewport 390×844: `evidence/onboarding/ensaio-sem-chave-desktop.png`, `evidence/onboarding/ensaio-sem-chave-celular.png` (alerta honesto, retry, mensagem/configuração preservadas); `evidence/onboarding/ensaio-revisado-desktop.png`, `evidence/onboarding/ensaio-revisado-celular.png` (resposta sintética e revisão confirmada); `evidence/onboarding/ensaio-sintetico-desktop.png`, `evidence/onboarding/ensaio-sintetico-celular.png` registram estado stale após edição em outra aba. Sem overflow horizontal nos asserts E2E. A ajuda completa organização/instalação está visível e quebrável. Tema e marca existentes foram preservados. Capturas promovidas do diretório local para evidência versionada após reinspeção; não representam uma chamada real ao provedor.

## Ambiente e limites

Supabase local `zapfloo-onboarding-e2e` retomado dos volumes preservados, aplicado só 0223 e tipos gerados pelo CLI. Primeira inicialização falhou por socket Colima ao montar analytics; retentativa com `--exclude vector,logflare` passou. Logs startup privados não devem ser publicados (podem conter chaves sintéticas do Supabase). Nenhum env foi aberto/editado, nenhum banco remoto/produção foi acessado.

Encerramento autorizado pelo pai: `supabase stop --project-id zapfloo-onboarding-e2e --workdir /tmp/zapfloo-onboarding-e2e.KooVaP`, **exit 0**, `/tmp/ensaio-supabase-stop.log`, sem `--all`/`--no-backup`. `docker ps` filtrado ficou vazio; volumes `supabase_db_zapfloo-onboarding-e2e` e `supabase_storage_zapfloo-onboarding-e2e` preservados. Next (3001) e receiver (54380) sem listeners após Playwright. Docker/Colima globais não foram parados; evidências preservadas.

Limites técnicos da prévia: mensagem 4000 caracteres; saída 1200 tokens (ou teto menor existente) e 12000 caracteres; AbortSignal global 30s no SDK (inclui retries, ver `ai/src/generate-text/generate-text.ts`, `prepareRetries` recebe o mesmo `mergedAbortSignal`); janela DB 60s para recuperação; seis tentativas/min por org via contador existente, fallback por processo quando Redis indisponível. A janela não é expiração estrita da conclusão: após 60s, um resultado ainda pode concluir se seu run_id continuar corrente; se outra tentativa o substituiu, CAS o recusa. Sem nova regra comercial e sem bypass do orçamento canônico.

Sucesso sintético E2E testado via preload exclusivo do processo Next do harness, em `tests/e2e/helpers/onboarding-provider-preload.mjs`, opt-in em Playwright; guard exige URL Supabase local e chave literal sintética, Next inicia em 127.0.0.1, intercepta OpenAI para receiver HTTP local e bloqueia outros provedores reais. Não há branch fake em app/lib nem import do helper pela produção. Resposta e usage declaram dados sintéticos. Esse teste é integração de SDK/seam/SQL/UI, não uma chamada real de IA. Não usou NODE_OPTIONS global, não alterou configurações do desktop.

## Living System / limitações

- Entrada e porta: painel embutido de setup-ai; saída: resposta/erro e revisão persistidos no rascunho.
- Observabilidade: llm_calls guarda consumo/custo; api_audit_log recebe início/conclusão/revisão sem texto/chaves; painel mostra último resultado/estado.
- Próximo passo: corrigir configuração/repetir ensaio, ou continuar depois via exploração existente. Lease evita running eterno bloquear retomada.
- Retorno: resultado humano revisado é vinculado ao snapshot atual; edição invalida e exige repetir. Não transforma prévia em ativação.
- Mapa: docs/architecture/onboarding-ensaio.architecture.json; jornada: J1 ensaio no mapa de testes.
- Não validados por este lote: ferramentas/RAG/WAHA, contatos autorizados/canais, publicação/ativação, wizard completo e instalação VPS fresca integral.
- Aviso Vite existente: configLoader native planeja incompatibilidade com ESM em config CJS; mantido visível. Não afirmar saída pristine. Skip da suíte DB: `tests/invariants/webhooks-inbound.test.ts:539`, rate limit 429 documentado como coberto pelo unit do fallback.
- Nos E2E, foram observados avisos de Redis indisponível/fallback em memória, Sentry DSN local `off`, ausência de configuração local e `supabase.auth.getSession()`/`onAuthStateChange()` sobre leitura de user. O último não foi diagnosticado: o novo caminho usa `requireOnboardingCtx`/guard canônico com autenticação validada, mas a origem precisa do warning não foi localizada; não é declarado resolvido ou comprovadamente herdado.
- Sem commit/push/merge/deploy/VPS/chaves reais/mensagens reais.

## Arquivos deste lote

- DTO/executor/actions: `lib/onboarding/ensaio.ts`, `lib/onboarding/executar-ensaio.ts`, `app/actions/onboarding/ensaio.ts`.
- UI: `app/onboarding/setup-ai/_ensaio.tsx`, `_form.tsx`, `page.tsx`; PT/ES em `lib/i18n/dicionario.ts`.
- Seam: `lib/agent-engine/edge/llm/run-model-call.ts`, `credentials.ts`; demais consumidores/defaults preservados.
- Banco: `supabase/migrations/20260908191151_0223_onboarding_rehearsal.sql`, apêndice de `supabase/baseline.sql`, linha de `supabase/migrations/MANIFEST.md`; `lib/database.types.ts` gerado pelo CLI (inclui schema local acumulado dos lotes anteriores, não editado à mão).
- Testes: `tests/invariants/onboarding-ensaio.test.ts`, `tests/unit/onboarding-ensaio-{action,executor,ui}.test.ts(x)` (inclui regressões do seam e credential), extensão de `tests/e2e/troca-de-organizacao-tem-volta.spec.ts`, `tests/e2e/helpers/onboarding-provider-preload.mjs`, opt-in isolado em `playwright.config.ts`. Os testes preexistentes `seam-respeita-o-binding.test.ts` foram executados sem alteração.
- Documentação: `docs/architecture/onboarding-ensaio.architecture.json`, atualização de `onboarding-preparacao.architecture.json` e README; `docs/testing/user-journey-map.md`; `.changes/2026-09-08-onboarding-ensaio.md`; este relatório e imagens sintéticas em `.superpowers/evidence/ensaio/`.
- As outras alterações já presentes no worktree pertencem aos lotes anteriores ou ao agente pai e foram preservadas.
