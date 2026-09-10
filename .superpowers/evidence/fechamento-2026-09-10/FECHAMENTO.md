# Fechamento da fila — 10/09/2026

Repositório correto: `juansanchees/zapfloo-crm`. Este documento encerra e preserva o trabalho; não autoriza implementação, merge, publicação ou exclusão. Os relatórios copiados nas subpastas são snapshots históricos: frases como “sem commit”/“somente no Desktop” descrevem o momento da medição, antes deste arquivamento.

## Relatório único

| CONCLUÍDO E TESTADO | PENDENTE | BLOQUEADO |
|---|---|---|
| Backup anterior: `/Users/juansanches/Desktop/zapfloo-2026-09-10.bundle`, 114.730.564 bytes. `git bundle verify` repetido no fechamento: válido. `codex/onboarding-roxo` já contém seis commits `wip:` que salvaram os arquivos soltos. | Os seis WIPs preservam rascunhos; não são aprovação técnica de merge nem prova de UX. | Nenhum bloqueio de salvamento identificado antes dos pushes finais; confirmar refs remotas no terminal. |
| `codex/gates-local`, commit `dc175239b`: quatro arquivos de isolamento de gates. Na medição anterior, Node 22.23.2: `time corepack pnpm lint` exit 0, 63,59 s, 310 warnings/0 erros; `corepack pnpm test:unit --maxWorkers=6 --reporter=verbose` exit 0, 702 arquivos, 7.544 aprovados + 1 expected fail. Rodapé Vitest: 334,04 s; tempo externo registrado: 335,48 s. `corepack pnpm typecheck` exit 0. Logs em `gates/`. | Validar a correção no checkout PRINCIPAL, com os dois worktrees reais completos. As medições anteriores foram SOMENTE no worktree isolado, com canária aninhada; não equivalem a essa prova. A main permanece sem a correção. | Node 24 + jsdom: 11/14 casos de importação de Leads falham no parsing multipart do undici; Node 22 + jsdom e Node 24 + ambiente node passam nos 14. Compatibilidade Node 24 não corrigida. |
| Regressão/sabotagem anterior: remover a exclusão Vitest produziu exit 1; restaurar produziu 33 testes verdes nos seis arquivos selecionados. No fechamento, nova execução dos dois testes diretamente alterados: 20 testes aprovados, exit 0. | Não criada mudança de release: são gates locais, sem nova capacidade/ação do operador de VPS. Não interpretar a ausência de fragmento como dispensa para as futuras mudanças de produto. | — |
| Auditoria de histórico completo arquivada nesta branch, em `publicacao/`: Gitleaks 8.30.1, `--all --full-history -m`, 163 ocorrências, 160 fingerprints, todas classificadas. Licença MIT e copyright upstream preservados. | Dono tornar repositório e três pacotes públicos separadamente; depois comprovar pull anônimo 200 e revisar a limpeza por digest. | Repositório ainda PRIVATE, confirmado no fechamento por `gh repo view juansanchees/zapfloo-crm --json visibility`. Não abrir PR. Prova anterior de acesso anônimo aos pacotes: 401, não 200. |
| Tarefas 4 e 5: apenas leitura do código e proposta em conversa. Nenhum código, schema ou tela implementado por esses lotes. | Jornada P0: separar atendimento humano da ativação de IA, validar números/navegação/áudio/geração e banco fresco. Visual: tokens/layout de Conversas, Calendário, Automações, Leads e Dashboard. Faltam implementação, testes, evidências de browser, checklist vivo, i18n/registry/fragmentos e atualização do mapa de jornadas. | Desenho aguardava aprovação quando a fila foi encerrada. Pareamento físico depende de um número de teste e participação do dono; não foi tentado neste lote. |

## Respostas específicas

### a) Onde os gates foram executados?

Somente em `/Users/juansanches/Documents/ChatGPT/zapfloo-gates-local`. NÃO rodei `pnpm lint` e `pnpm test:unit` corrigidos em `/Users/juansanches/Documents/ChatGPT/CRM SAAS Deskcomm`, onde estão os worktrees reais com dependências e build. A fixture/canária comprovou isolamento sintético, não o cenário físico completo exigido. Isso continua pendente, sem mudar de checkout ou aplicar correção à main no fechamento.

Comando de revalidação do fechamento, no worktree isolado e Node 22:

```sh
corepack pnpm exec vitest run tests/unit/escopo-dos-gates.test.ts tests/unit/namespace-das-imagens.test.ts
```

### b) O que o Gitleaks encontrou?

O número medido não foi 3.809: no snapshot anterior ao fechamento eram **3.872 commits alcançáveis**, dos quais **3.839 com patches textuais** lidos pelo detector. Os demais: 22 sem alterações A/M e 11 somente binários. O clone deixou de ser raso. Novos commits deste fechamento aumentam a contagem; não pertencem àquele snapshot de histórico.

A lista integral, por ocorrência, commit completo, arquivo e classificação, SEM valor de segredo, é o anexo **[publicacao/ACHADOS.md](publicacao/ACHADOS.md)** (163 linhas; repetições de merges incluídas). Resumo com um commit representativo por arquivo:

| Commit representativo | Arquivo | O que é | Ocorrências |
|---|---|---|---:|
| `4f11af55a4233a32942cff2717491c676d2a4072` | `lib/notifications/prefs.ts` | Identificador de armazenamento, não credencial | 16 |
| `ea29ec4c763a87da873b5b40801aa4ffb60db541` | `lib/followup/gatilho-caso.handler.ts` | Identificador de handler | 8 |
| `ea29ec4c763a87da873b5b40801aa4ffb60db541` | `lib/followup/gatilho-etapa.handler.ts` | Identificador de handler | 19 |
| `ea29ec4c763a87da873b5b40801aa4ffb60db541` | `supabase/migrations/MANIFEST.md` | ID de conversa documentado | 13 |
| `ea29ec4c763a87da873b5b40801aa4ffb60db541` | `tests/sonda-radar-isolamento-orgs.ts` | JWT local de fixture, issuer supabase-demo | 13 |
| `5d37fdb4cb54d91e396fbd3167c9cf6de3272d43` | `lib/sentry/scrub.test.ts` | Token sintético de sanitização | 12 |
| `1e7a3c136d21f79d34c038861e202b8c3bb89ab9` | `app/actions/auth/signInWithPassword.test.ts` | Senha de teste com autenticação mockada | 5 |
| `1e7a3c136d21f79d34c038861e202b8c3bb89ab9` | `evidence/canais/baseline/e2e.txt` | UUID de registro da fixture, não a chave | 26 |
| `1e7a3c136d21f79d34c038861e202b8c3bb89ab9` | `evidence/canais/baseline/e2e-paralelo.txt` | UUID de registro da fixture, não a chave | 26 |
| `1cc49d55c3136d2f0b87ed5be026cbbf4cd2a215` | `tests/invariants/webhooks-secret-encryption.test.ts` | Chave sintética de teste do banco | 12 |
| `1cc49d55c3136d2f0b87ed5be026cbbf4cd2a215` | `tests/invariants/webhooks-inbound.test.ts` | Chave sintética de teste do banco | 12 |
| `d2595e3d554024d45a5351c623b4d7f9b865ed24` | `.env.waha` | Hash de autenticação WAHA compatível com SHA-512, não plaintext | 1 |

Não foi confirmada credencial de produção plaintext. O material WAHA é derivado de segredo e já está no upstream público: **rotacionar a chave original onde ela tenha sido utilizada**, antes de abrir se houver reutilização em ambiente ativo. Não verifiquei reutilização na VPS; não rotacionei nem purguei nada. Fixtures não devem ser reutilizadas em produção.

A checagem adicional dos artefatos a arquivar encontrou um alerta em `publicacao/AUDITORIA.md:17`: é o SHA-256 publicado do tarball oficial do Gitleaks, não uma credencial. O log histórico do scanner sai 1 por achados; não foi apresentado como scanner verde.

### c) Schema nos lotes de jornada/visual?

**Não toquei em schema nesses lotes.** Não há nova migration, apêndice ou linha de MANIFEST a declarar para eles. A branch preservada `codex/onboarding-roxo` já tinha mudanças anteriores: na comparação atual com main há **oito** migrations, 0220–0227 (inclui `20260909130000_0227_user_dashboard_preferences.sql`), além de baseline e MANIFEST. Isso não é nova entrega deste fechamento nem revalidação de sua idempotência. Banco e RLS não foram testados nesses lotes.

### d) Dependências / ordem de integração futura

`codex/gates-local` nasce da main `22620d85b` e não depende de `codex/onboarding-roxo`. A auditoria é apenas documentação/evidência arquivada na mesma branch. Ordem recomendada: **gates-local → validar no checkout principal real → revisar e integrar onboarding-roxo** (inclui seis WIPs). Depois, em trabalho futuro autorizado, jornada P0 antes do visual. Não foram criadas branches de implementação para tarefas 4/5.

`codex/production-hardening` e `codex/release-probe-fail-soft` são branches históricas, não trabalho novo desta fila. Não presumir que devam ser mescladas: comparar com main antes, pois pode haver squash/equivalência de mudanças. Não declaro nenhuma pronta sem essa revisão.

## O QUE NÃO FOI MEDIDO

- Gates corrigidos no checkout principal com os dois worktrees reais.
- Build, `gov:verify` integral, `test:db`, baseline fresco, RLS e E2E nos lotes de jornada/visual.
- Atendimento real, conexão física de telefone, semântica da geração de IA e transcrição de áudio no fluxo final.
- Geometria/contraste das cinco telas em desktop, tablet e 390px; transbordo antigo não reverificado.
- Saúde atual da VPS, SSH, imagens realmente utilizadas, variáveis efetivas ou disponibilidade de rollback.
- Pull anônimo 200 após abertura (abertura ainda não ocorreu).
- Segredos em binários/OCR, camadas Docker, Actions/logs/artefatos, LFS externo, refs ocultas de PR, commits inalcançáveis e superfícies fora do Git.
- Mecanismo completo de construtores/realms no Node 24; o defeito foi localizado antes de `pareceArquivo`, sem alterar a rota.

## Preservação / limites

Não se inclui o bundle binário no Git: ele é backup local, os commits/branches são o backup remoto. Relatórios, scripts de auditoria e logs desta fila são arquivados aqui. `.codex/config.toml` é a única alteração pessoal pré-existente no checkout principal; permanece fora de commit, conforme proibição expressa do dono. Nenhuma `.env` operacional foi copiada. Sem merge, deploy, `update.sh`, acesso à VPS, rotação ou exclusão de pacote.

Os logs, JSONs e scripts originais estão integralmente em `evidencias-originais.tar.gz`, mantendo os diretórios `gates/` e `publicacao/`. Os relatórios Markdown principais também ficam descompactados. O arquivo comprimido evita que scripts históricos de auditoria passem a ser coletados como código ativo pelos gates. Os logs brutos preservam inclusive linhas em branco no fim, sem alteração de sua evidência.

O status de push e os SHAs finais devem ser conferidos por `git ls-remote --heads origin` e comparados a `git rev-parse <branch>`; o relatório final da conversa fornece esses resultados após o envio.
