# SDD ledger — plan: docs/superpowers/plans/2026-09-10-jornada-p0-correcao.md

## Preflight

| Tarefas / interface | Conferência |
|---|---|
| 1 → 2, markWhatsappConfigured e progresso | 1 é dona do escritor; 2 consome confirmação antes do avanço. Não executar implementações em paralelo. |
| 1 → 3, whatsapp/onboarded_at | E2E não preenche marcas manualmente; só observa produto e DB. |
| 2 → 3, rótulos e fluxo sem IA | Specs serão atualizadas após UI pronta; não manter seletor .last ou botão inexistente. |
| 3 → 4, prova real e CI | Distinguir fronteira controlada nos testes de contrato de QR/pareamento reais. |
| 1, coerência interna | Negativos de tenant/status preservam segurança; escrita só após confirmação. |
| 2, coerência interna | Cookie não marca conclusão; adiar IA não pode apagar evidência ou agente ativo. |
| 3, coerência interna | Spec fresca não pode apagar outras organizações/sessões. Ausência de segredos é asserção. |
| 4, coerência interna | QR sem scan não prova conclusão; aparelho de teste foi solicitado por pergunta assíncrona. |

Ruling: cookie de exploração terá 30 dias, seguindo a preferência de organização ativa existente em app/actions/shell/setActiveOrg.ts — é preferência autenticada, não token de autorização — se inadequado, custo é alterar a validade, sem migração.
Ruling: o comando de rebase pedido prevalece sobre a regra geral de atualizar por merge — preservado backup codex/jornada-p0-backup-20260910 em 301530677, remoto original igual — publicação exigirá force-with-lease exato para não sobrescrever trabalho concorrente.

## Estado

- Rebase concluído: d721083e7 sobre ce973b4a0. Commit duplicado dos gates reconhecido; único conflito em i18n resolvido preservando ambas as listas.
- Branch limpa antes do plano; root contém somente alteração do dono em .codex/config.toml, intocada.
- Baseline gov:verify GREEN exit 0, log /tmp/zapfloo-p0-base-rebase.log: 750 files, 7880 tests passed; lint 0 errors/310 warnings; typecheck e dois lints especializados verdes.
- Infra inventariada: Docker funcional; nenhuma imagem WAHA/Redis observada. Supabase compartilhado 54321/22/24 intocado. CLI será resolvida pelas dependências locais, não presumida ausente por PATH.
- Task 1: despachada p0_estado_conexao; base 943b14d4c, brief task-1-brief.md. Contrato é server writer + router, sem UI ou schema.
- Task 1: executor terminou em eea045244, report task-1-report.md. Dirigidos 34/34, lint e typecheck verdes; sabotagem escritor 2/9 vermelhos restaurados. Suíte completa feita sem escalada ficou 5 files/10 tests failed; gate próprio corrigido e 4 famílias ambientais 63/63 fora do sandbox. Gov completo com escalada permanece obrigação do root. Revisão ainda aberta.
- Task 1: revisão p0_review_estado APPROVED, zero findings; consolidado gov:verify continua pendente. Faixa revisada 943b14d4c..eea045244.
- Task 2: p0_interface_conexao implementando a partir de f00b2f6d7. RED comprovou quatro defeitos na conexão, cookie sem maxAge, skipAi destrutivo, ensaio retornando à conexão e saídas duplicadas na composição.
- Task 3: não iniciada.
- Task 4: dono confirmou aparelho e número de teste disponíveis. Preparando stack isolada zapfloo-p0-correcao-20260910, API 57321, DB 57322, app 3013. Stack anterior intocada.
- Infra: baseline exit 0; bootstrap exit 0; Redis REST HTTP200/PONG e WAHA HTTP200 confirmados. Banco tem 1 organização, zero agentes, zero credenciais IA, zero canais, zero onboarded.
- Inventário E2E p0_e2e_impacto: ordem antiga em onboarding-ativacao-restrita e troca-de-organizacao-tem-volta; wizard-do-funcionario tem contrato legado de criação de IA. Preservar cobertura de revisão/ativação, MFA/convite/finish. Poll GET perde channel_session_id retornado pelo POST; incluído explicitamente na Task2. Cópia da saída em welcome e ensaio também deve ceder ao controle do layout.
- GitHub confirmado público; PR7 ainda OPEN em ce973b4a0; não existe PR de jornada-p0. Nenhuma alteração externa feita.
- CI base PR7 medido: verify, invariants, build-and-size, imagens-ok SUCCESS; e2e FAILURE (três partes), run 34511058878. Logs sendo lidos sem rerun para separar regressões herdadas. Não alegar cinco verdes.
- Triagem CI base concluída p0_e2e_impacto: 27 falhas/248 passadas/8 puladas. 1 ligada à ordem alvo, 23 fora dos dez itens, 3 timeouts indeterminados. Registrado em evidence/.../ci-base.md e comunicado ao dono. Mantê-las pendentes, sem suprimir testes nem iniciar leva visual paralela.
- Task3 refinada após inventário somente-leitura: nova spec normal-CI cobre negativa/saída; vps-fresh é única prova de QR+scan real. Config fresh estreito versionado é necessário porque o config normal carrega .env.e2e de outro perfil; não introduzir preload/lista paralela. Escopo Vitest volta à raiz com exclusões explícitas para árvores locais; não justificar broad ignore só por fixture sintética.
- test:db integrado iniciado em f00b2f6d7, Node22/escalado, session 58239, log /tmp/zapfloo-p0-test-db.log. Install/update passaram; invariantes ainda em execução. UI/docs podem mudar, baseline/invariantes/script/config DB congelados.
- test:db concluído exit0: 167 arquivos, 1374 testes aprovados/1 skip existente; duração Vitest 452,94s. Install/update sem erro, cleanup do container efêmero concluído; schema e testes DB não foram editados nesta rodada.
- Prova real: aguardar a spec fresca versionada da Task3 antes de login/welcome/QR. Não consumir manualmente o estado recém-bootstrapado antes do preflight e depois chamar esse mesmo banco de fresco. Build/start e leitura da página de login podem ser preparados antes; scan será uma única etapa assistida, sem mensagens.
- Harness local antes do primeiro build/start: SENTRY_DSN=off explícito, seguindo gerar-env-e2e.sh, para impedir telemetria de teste indo ao DSN padrão externo. Nenhum Next deste perfil foi iniciado antes do ajuste.
- Task2 commit a912e98f7 revisado: duas correções Important solicitadas — vários canais precisam de escolha explícita sem seleção inicial; adiamento de IA precisa de audit onboarding.ai_skipped depois da persistência. Executor retomado, ownership ampliada somente para lib/audit/actions.ts além do brief original.
- Task2 medição: suíte completa exit1, 752 arquivos/7905 testes verdes e um gate de rótulo canônico vermelho; fallback de canal corrigido sem allowlist. Rodada dirigida posterior 10 arquivos/55 testes passou. Não confundir com suíte completa verde após a correção.
- Task 1: complete (commits 943b14d4c..eea045244, review clean). Verificação consolidada permanece na Task4.
- Task2 fix round1 implementado c407b3525: 3 arquivos/22 testes verdes, typecheck/lint0, três sabotagens efetivas restauradas. Re-review ainda pendente.
- Build CI local iniciado em c407b3525, sessão51350, log /tmp/zapfloo-p0-ci-build.log; produto congelado após todas as sabotagens restauradas. Não é publicação.
- Task 2: fix round 1/5 (2 addressed, 0 open; commits a912e98f7..c407b3525). Re-review p0_review_interface confirmou ambos, sem nova quebra.
- Task 2: complete (commits f00b2f6d7..c407b3525, review clean).
- Build CI local concluído exit0 em c407b3525: Next compilou, TypeScript passou, páginas geradas e controle positivo confirmou host57421 no bundle.
- Task3 despachada p0_specs_versionadas a partir de c407b3525; somente specs/config/gate/workflow. Root mantém ownership de docs, ambiente e prova assistida.
- Docs root: mapa arquitetural corrigido para confirmação/adiamento/audit separados de ativação; mapa de jornadas corrige PASS histórico, ordem antiga, publicação automática e MFA obrigatório. Testes focados mapas-de-arquitetura + numero-de-jornada-e-unico: 2 arquivos/119 testes passed, exit0, log /tmp/zapfloo-p0-docs-tests.log. Docs ainda em rascunho e sem fingir pareamento aprovado.
- Rechecagem GitHub: PR7 continua OPEN em ce973b4a0 e nenhum PR de jornada-p0 existe. Nenhum PR criado nesta etapa.
- E2E normal R2 exit1: 10 passed/2 failed/2 skipped/5 did not run, log /tmp/zapfloo-p0-e2e-normal-r2.log. Negativa final e quatro trocas de organização passaram; falhas são expectativa antiga do rótulo de continuação e texto cérebro da configuração de IA. Executor corrige preservando controle acionável. Screenshots gerados arquivados em evidência atual antes de restaurar onze históricos sobrescritos; executor ajustará destinos para outputPath.
- Harness fresco ganhou comando proof que injeta opt-in somente no Playwright versionado, com umask0077. Ainda não executado; perfil fresco permanece sem login/conexão.
- Normal R3 exit0: 12 passed/2 skipped preexistentes sem preload, 52.4s. Synthetic ativação+troca em curso. gov tentativa1 exit1 antes dos unitários: lint:channels encontrou somente menção WAHA no comentário novo skipWhatsapp.ts:54; ownership do Task3 ampliada apenas para neutralizar esse comentário, sem comportamento/allowlist. Repetir gov após correção.
- gov R2 concluído exit0: typecheck/lints, 753 arquivos/7909 testes unitários passed, 308.18s Vitest. Log /tmp/zapfloo-p0-gov-final-r2.log, evidência gov-local.md. Executado no worktree jornada-p0, não principal. Synthetic R1 exit1 5passed/2failed7.3min (fixture pós-SSR); R2 somenteativação em curso após corrigir preparação, sem weaken de políticas.
- Synthetic R2 exit0: recuperação+ptBR+es, 3passed1min; PNGs fictícios preservados em e2e-synthetic-r2. Task3 commit95e7e733f, pacote review-task-3.diff gerado a partir de c407b3525, 115074bytes; aguardando relatório para dispatch da revisão.
- Build do perfil fresco A concluído exit0, log /tmp/zapfloo-p0-fresh-build.log. Next local3013 iniciado sessão67762, /login HTTP200. Nenhum login/pareamento ainda; execução da spec fresca aguarda reviewTask3.
- Task3 revisão p0_review_specs em 066bc2c5b (pacote review-task-3-completo.diff) pediu fix: lifecycle/permissões QR transitório e limpeza negativa que ignora {error}. Minor TOTP retry de virada será abordado de forma limitada. Logs do root resolvem cannot-verify dos resultados automáticos; normalR3 executou todos os casos preservados de funil/atividade. Prova real continua Task4, não lacuna de código presumida.
- Task3 fix round1/5 despachado ao mesmo executor, base066bc2c5b. Achado adicional do root: Playwright1.62.1 captura DOM no erro mesmo com screenshot/trace off; lib/index.js:649-664 usa PLAYWRIGHT_NO_COPY_PROMPT, 691-705 grava error-context.md. Precisa neutralizar captura na config fresh e provar com sabotagem sem revelar marcador sensível. Sem mudanças de produto; perfil fresco permanece sem login/QR e Next3013 vivo.
- Perfil automático de E2E separado: Supabase zapfloo-p0-ci-20260910, API57421/DB57422, app3014; baseline aplicado exit0, zero organizações. Não compartilha transporte nem banco da prova de pareamento. Nenhum Next iniciado até este registro.
- Task3 fix round1: commits 9f43b79e2 e a47a69823 protegem lifecycle/permissões do QR, validam cleanup negativo e impedem snapshots DOM automáticos e de matchers nas fases sensíveis. Re-review ainda pendente.
- Prova adversarial do root com Chromium real: /tmp/zapfloo-p0-dom-real.log exit0. Duas falhas deliberadas exit1; sem guard o marcador fictício runtime aparece no error-context; com guard o arquivo existe mas o marcador não aparece. Nenhuma credencial/QR real usado nessa prova.
- Negativa reexecutada em B após cleanup: /tmp/zapfloo-p0-e2e-negative-fix1.log exit0, 1 passed36.8s. Perfil A foi parado antes de qualquer login; B reconstruído com exit0; agora A em reconstrução para a prova fresca, sem interferir em banco/sessões.
- Task3 fix round1 re-review APPROVED em 34ec7729b; quatro findings addressed, zero nova quebra. Task3 complete. BuildA R2 exit0, app3013/login200, RedisPONG/HTTP200 e WAHAHTTP200. Task4 inicia agora a única jornada fresca com scan manual autorizado; ainda não há resultado de pareamento.
- Primeira execução fresh exit1 antes do login, 2.5s, log /tmp/zapfloo-p0-fresh-proof.log. Sonda somente leitura isolou HEAD400 em onboarding_drafts.select(id), cuja PK real é organization_id (baseline18238). As outras leituras retornaram200; estado{} e ausência de canais/agentes/MFA/conclusão reconfirmados. Fixround2Task3 estreito autorizado para consulta+regressão; sem schema/produto. Sonda corrigida /tmp/zapfloo-p0-fresh-preflight-coluna.log exit0, todas as HEAD200/count0. Não houve QR ou pareamento nesta tentativa.
- govR3 terminou exit0:754files7912tests551.59s, typecheck/lints sem erros310warnings. Log/tmp/zapfloo-p0-gov-final-r3.log. Coletou antes da criação do teste adicional de preflight do fixround2; portanto essa nova regressão depende da rodada focada própria e não está incluída na contagem.
- Task3 fixround2 commit af20e4b27 aprovado pelo re-review: finding coluna HEAD addressed, nenhuma nova quebra. GateAST dirigido1/1pass e RED confirmado; typecheck/lint0. FreshR2 retomada sem reset, /tmp/zapfloo-p0-fresh-proof-r2.log. SHA remoto jornada-p0 permanece301530677 e PR7OPEN/ce973b4a0/não mesclado; nada foi empurrado/aberto nesta rodada.
