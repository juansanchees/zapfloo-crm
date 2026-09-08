# Preparação inativa — lote de backend

Data: 2026-09-08. Worktree `codex/onboarding-roxo`, base `22620d85b4023e9975d7dbfd673e9b8bd9393b96`. `origin/main` conferida por fetch, mesma base. Sem commit/push/deploy.

## Entrega e fronteira

CONFIRMADO por código e testes direcionados: nova ação `prepararRascunho` converte uma revisão salva em agente **inativo, não padrão e sem ponteiro publicado**, com versão `draft` sem canal. Não chama IA, runtime legado, WAHA, memória compartilhada ou publicação. Não altera settings/onboarding_state. Modelo, provedor e origem da credencial são obrigatoriamente explícitos; ausência de catálogo/modelo válido é erro, não escolha de fallback.

O criador legado não é usado: ele continua com sua semântica anterior. Apenas seu construtor de prompt foi extraído, preservando os textos. Regras preparatórias são incorporadas na versão isolada, sem escrever na memória compartilhada. Se o prompt composto exceder o teto de 20.000 caracteres, a ação recusa sem truncar.

**Não foi entregue nova interface neste lote.** A ação ainda não está conectada a um botão. É uma dependência implementada e testada, não uma jornada de produto terminada. Ensaio real sem canal, prova de revisão vinculada ao teste e troca da ordem do wizard continuam pendentes. Snapshot salvo não é atestado de teste nem aprovação.

## Consistência e autorização

- Guard canônico admin/MFA; identidade vem da sessão e fingerprint detecta troca de contexto entre abas antes de usar service role.
- RPC invoker, execute somente service_role; locks org → vínculo aceito/não revogado → draft → agente → versão. Revalida organização ativa/não concluída e snapshot do negócio, fechando corrida entre leitura e gravação.
- Revisão e ponteiro esperados impedem sobrescrita concorrente. Mesma solicitação retorna os mesmos IDs e não duplica audit.
- Snapshot completo da versão detecta alterações pelo editor; agente ativo, publicado, arquivado ou padrão é recusado. Nome ocupado nunca permite reaproveitar agente alheio ao draft.
- Nova revisão cria outra versão, preservando a anterior; nenhum dado existente recebe backfill.
- Credencial não nula precisa pertencer ao mesmo tenant/provedor, estar ativa e validada. Nula apenas representa escolha da chave da instalação: **não comprova que ela existe ou funciona**.
- Audit na mesma transação, apenas revisão e ID de versão, sem prompt/regras/segredo.

## Verificação

- TDD inicial: 15 testes DB falharam por ausência da nova função; após implementação, 15 passaram (baseline install/update). Mais casos de defesa foram acrescentados antes da rodada final.
- 14 unitários direcionados passaram após criação do contrato/prompt; primeira execução recusou imports ausentes. `pnpm typecheck` passou com os tipos gerados no Supabase local.
- Revisão independente estática: sem achados bloqueantes. Conferiu migration/apêndice idênticos, ordem da varredura, MANIFEST, isolamento/CAS/snapshot e preservação do texto legado. Não substitui execução dos gates gerais.
- `supabase db advisors --local --type security --level warn`: seis WARN, nenhum relativo à preparação. Três funções existentes sem search_path fixo (`fn_ai_agent_version_content_immutable`, `fn_agent_versions_immutable`, `fn_contato_anonimizado_limpa_campos_personalizados`); extensões vector/citext/pg_trgm em public. São pendências de reauditoria, não corrigidas silenciosamente neste lote. Arquivo local `/tmp/zapfloo-prepare-advisors.json`.
- `pnpm gov:verify`: saída 0; typecheck, lint e **708 arquivos/7.612 testes unitários** aprovados. Log `/tmp/zapfloo-prepare-gov.log`.
- `pnpm test:db`: saída 0; **160 arquivos/1.285 aprovados e 1 ignorado**, baseline install/update, 233,83s. Os 24 casos de preparação passaram. Log `/tmp/zapfloo-prepare-db-final.log`; container efêmero removido pelo harness. O skip preexistente não foi tratado como aprovação.
- `pnpm e2e:build`: saída 0; controle positivo confirmou host local 127.0.0.1:54321 no bundle. Log `/tmp/zapfloo-prepare-build.log`. Não houve publicação de imagem ou deploy.
- `pnpm test:e2e tests/e2e/troca-de-organizacao-tem-volta.spec.ts`: saída 0; **3 aprovados**, 24,1s. Log `/tmp/zapfloo-prepare-e2e.log`. Regressão de salvamento/retomada, troca de organização e MFA do fluxo anterior, não prova visual da preparação nova ainda sem UI.
- Capturas desktop e celular de `evidence/onboarding/rascunho-desktop.png` e `rascunho-salvo-celular.png` reinspecionadas: campos, salvamento e status legíveis; a spec mede ausência de overflow. Marca/tema são os do fixture sintético, não a produção.
- O E2E emitiu avisos do SDK sobre uso de objeto de sessão e fallback de Redis para memória. Não foram convertidos em prova de falha de autorização nem descartados: merecem rastreio separado. O contrato novo usa o guard admin/MFA canônico e não confia em getSession.
- `git diff --check`: saída 0. Comparação automática confirmou migration/apêndice idênticos e posicionamento antes da varredura de privilégios.

## Operação, rollback e continuidade

Migration `20260908183448_0222_onboarding_draft_prepare.sql`, apêndice idempotente antes da VARREDURA anon, MANIFEST e tipos gerados. Aplicada somente em banco local sintético; invariantes usam Postgres efêmero. Nenhuma chave de IA/WhatsApp real foi usada.

Após a verificação, somente o projeto Supabase local `zapfloo-onboarding-e2e` foi desligado, sem apagar volumes. Worktree e alterações anteriores preservados; nenhum commit, merge ou push.

Reversão futura de aplicação: código antigo pode ignorar os campos aditivos; manter dados e versões para não perder trabalho. Não executar downgrade destrutivo/drop como rollback de interface. Agentes deste caminho permanecem inativos. Não existe rollback remoto a executar neste lote.

Mapa `docs/architecture/onboarding-preparacao.architecture.json`; jornada J1.37 marca explicitamente o contrato ainda sem entrada visual. As conexões implementadas são action → leitura da configuração/negócio → prompt compartilhado → RPC → agente/versão/snapshot/audit. **Falta a conexão com a interface e com o ensaio; portanto a Definition of Done da funcionalidade completa ainda não está satisfeita.**

Próximo recorte: expor a seleção de IA e a preparação no novo fluxo, implementar ensaio isolado sem ampliar o runtime deprecated, persistir prova vinculada à configuração efetiva e invalidar a revisão se o conteúdo mudar. Só depois integrar conexão e autorização explícita do atendimento.
