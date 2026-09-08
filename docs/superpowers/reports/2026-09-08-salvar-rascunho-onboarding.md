# Salvar e retomar configuração — lote local

Data: 2026-09-08. Branch `codex/onboarding-roxo`, base `22620d85`. Sem commit, push ou deploy.

## Escopo implementado

Configuração preparatória na etapa existente de treinamento: nome, jeito de falar e regras. O botão **Salvar rascunho** não cria agente, versão executável, canal ou memória compartilhada. Não seleciona modelo e não exige chave de IA. A ordem legada do wizard e o botão de criação continuam separados deste salvamento.

Migration 0221 cria uma linha por organização em `onboarding_drafts`; RPC invoker, exclusiva de service_role, confere admin aceito/não revogado e organização ativa/não concluída. Lock curto da organização, comparação de revisão e audit na mesma transação. Reenvio idêntico não cria revisão/audit extra. RLS dá leitura somente ao admin da organização; escrita direta é vedada a authenticated/anon. O apêndice no baseline entra antes da varredura final de privilégios.

Action resolve usuário/organização pelo guard canônico de admin/MFA. Fingerprint do contexto inicial detecta troca de organização/usuário em outra aba; não é credencial nem fonte de autorização. A tela mantém esse contexto junto dos campos. Conflito preserva o trabalho local; falha de leitura bloqueia gravação em vez de oferecer um formulário vazio que substitua dados existentes.

## Evidências e achados

- TDD de banco: 11 falhas pela ausência da função, depois 11 casos aprovados em install/update.
- TDD da tela: três falhas antes de existir salvamento/retomada; os casos passaram após implementação.
- Revisão independente encontrou troca de contexto entre abas; corrigida com fingerprint inicial e regressões de usuário/organização/revisões iguais. Segunda revisão sem achados novos, condicionada aos gates finais.
- Primeira rodada integral de banco: 1.260 aprovados, 1 ignorado, 1 falha: faltava registrar a prova comportamental já existente em `PROVA_PROPRIA`. Registro corrigido; não afrouxa o teste de RLS.
- Primeira rodada geral identificou posicionamento da função depois da varredura final e metadados ausentes no fragmento de release. Ambos corrigidos; resultados finais abaixo devem vir de nova execução.

## Gates finais

- `pnpm gov:verify`: saída 0; typecheck/lint e **706 arquivos, 7.592 testes unitários** aprovados. Log `/tmp/zapfloo-draft-gov-final.log`.
- `pnpm e2e:build`: saída 0, host local encontrado no bundle como controle positivo. Log `/tmp/zapfloo-draft-build.log`. Não é imagem publicada/deploy.
- `pnpm test:e2e tests/e2e/troca-de-organizacao-tem-volta.spec.ts`: **3 aprovados**, saída 0, 40,5s. Log `/tmp/zapfloo-draft-e2e-complete.log`. Inclui salvamento no celular, conflito na mesma org e bloqueio de gravação em B após troca em outra aba, ambas com revisão 1.
- Capturas `evidence/onboarding/rascunho-{desktop,celular}.png` e `rascunho-salvo-celular.png` inspecionadas. Campos retomados, botão/status legíveis, sem overflow horizontal em 390px. Tema/marca padrão do fixture local: não representam alteração da identidade da produção.
- Primeiros E2Es pararam em duas falhas do teste (nome de tabela `channels` em vez de `channel_sessions`; seletor do CRM em vez do menu específico do onboarding). Corrigidas com referência ao schema/componente real, sem alteração de produto para acomodar o teste. Uma repetição concorrendo com unitários excedeu 5s no redirecionamento inicial; a rodada exclusiva passou sem aumentar timeouts.
- `pnpm test:db`: **159 arquivos, 1.261 aprovados e 1 ignorado**, saída 0. Baseline validado em install/update e container efêmero removido pelo harness. Log `/tmp/zapfloo-draft-db-final.log`. Skip de rate limit preexistente, não prova essa integração.
- Revisão independente final favorável por inspeção; `git diff --check` passou e migration 0221 corresponde integralmente ao apêndice, antes da varredura de privilégios.

Limites: os E2Es não têm chave de IA, WAHA/Meta ou Redis externo operantes. Aparece fallback de rate limit em memória; os testes não provam essas integrações. Nenhuma resposta sintética foi apresentada como ensaio real de IA.

## Operação e reversão

### Living System Checklist

- Entrada: campos reais de `SetupAiForm`, aberto pelo wizard após boas-vindas e a etapa de telefone existente.
- Saída: `salvarRascunho` → `fn_save_onboarding_draft` → `onboarding_drafts`; `lerRascunho` devolve os campos à mesma tela.
- Atividade: `api_audit_log`, ação `onboarding.draft_saved`, metadata somente revisão, consumida pela auditoria administrativa existente.
- Visibilidade/configuração: campos preenchidos na retomada, botão de salvamento, status acessível e alerta de conflito. Não há tela nova sem porta.
- Anti-morte: falha preserva campos e indica recarregar/conferir acesso; sem chave de IA o salvamento permanece disponível. Não há fila/trabalho de fundo para ficar abandonado.
- Continuidade IA/humano: não aplicável nesta operação preparatória; nenhum turno, handoff ou mensagem é produzido.
- Laço de retorno: revisão/contexto divergentes recusam a mutação, mantêm o formulário local e orientam comparação após recarga; nova revisão confirmada alimenta o próximo salvamento.
- Mapa: `docs/architecture/onboarding-rascunho.architecture.json` documenta entradas, saídas, auditoria e não-ligações com execução/ativação.

Somente Supabase local sintético e Postgres efêmero. Nenhuma migration no Supabase remoto, acesso à VPS, mensagem real, chamada de modelo, leitura de `.env*` ou alteração de chave/modelo de produção.

Após a prova visual, apenas o projeto local `zapfloo-onboarding-e2e` foi desligado, preservando volumes e dados sintéticos para retomada. A branch/worktree e todas as alterações anteriores foram mantidas.

Não há rollback remoto a executar. Para futura reversão de aplicação, manter a tabela aditiva e seus dados: o código anterior ignora o rascunho. Não apagar a tabela para reverter a UI. A migration não altera agentes/canais existentes e não faz backfill.

## Próximo recorte

Transformar a configuração salva em rascunho executável inativo, ensaiar sem canal e vincular a revisão à configuração efetivamente testada. Só então substituir a ordem do wizard e integrar conexão/autorização explícita. Este lote **não conclui o fluxo inteiro aprovado** nem prova atendimento externo por IA/WAHA/Meta.
