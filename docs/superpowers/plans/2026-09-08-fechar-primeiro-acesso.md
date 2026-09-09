# Fechar primeiro acesso — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Leia somente o brief da tarefa atribuída e os contratos nele referenciados.

**Goal:** Concluir a continuação do agente ensaiado até conexão e ativação restrita, sem criar um segundo agente ou liberar público implicitamente.

**Spec:** `docs/superpowers/specs/2026-09-08-primeiro-acesso-roxo.md`.

**Architecture:** Preservar rascunho/revisão/preparação 0220–0223. Confirmar revisão é uma transação sem publicação. Ativar é outra transação, explícita, que revalida a prova e o canal/allowlist. UI usa confirmação do servidor e não declara sucesso a partir de parâmetros do navegador. Organizações antigas mantêm leitura compatível.

**Tech Stack:** Next 16/React 19, Zod, Supabase/Postgres, Vitest, Playwright.

## Ajuste de saída aprovado pelo usuário

Na retomada, o usuário autorizou publicação controlada com validação essencial, adiando a bateria global. Prevalece sobre os gates integrais abaixo: manter login/organização e isolamento, ativação explícita restrita, concorrência, build/inicialização dos artefatos e recuperação. Aproveitar os resultados focados existentes; não repetir suítes globais por rotina. Revisão essencial do delta novo obrigatória; limites sintéticos e cenários adiados ficam explícitos. Não dispensa acesso ao banco correto nem proteção dos dados em produção.

## Global Constraints

- Trabalhar somente em `.worktrees/onboarding-roxo`, branch `codex/onboarding-roxo`. Preservar alterações de outros agentes. Commits locais permitidos; sem push/merge/GitHub/Actions/VPS/deploy por implementadores.
- Não abrir `.env*`, copiar/logar segredos ou enviar mensagens reais. Não chamar provedores externos nos testes. Dados sintéticos somente.
- Salvar/preparar/ensaiar/revisar/confirmar revisão/conectar não ativa agente. Ativação restrita exige ação explícita e lista de teste não vazia; público geral permanece bloqueado.
- Nenhum agente ou canal existente é substituído silenciosamente. Não usar `createDefaultAgent` para continuar o agente preparado.
- Guards canônicos de autenticação, MFA, papel, organização e RLS; service role filtra organização confiável. RPCs novas sem EXECUTE para PUBLIC/anon/authenticated.
- Migration nova + apêndice idempotente do baseline + MANIFEST; tipos regenerados pelo CLI para `public,graphql_public,storage`, nunca editados à mão. Não editar migrations aplicadas.
- Marca canônica prevalece; PT/ES, teclado, desktop/celular. Explorar não conclui onboarding; convidado e organização concluída não são forçados ao novo fluxo.
- Logs completos e exit codes reais. Não esconder falhas, skips ou warnings. Gates pesados sequenciais, coordenados pelo pai.

## Task 1: Contrato transacional de revisão confirmada e ativação restrita

**Ownership:** criar `lib/onboarding/concluir.ts`, `app/actions/onboarding/concluir.ts`, migration 0224, `tests/invariants/onboarding-concluir.test.ts` e `tests/unit/onboarding-concluir-action.test.ts`. Alterar `lib/schemas/onboarding.ts` somente para estado aditivo; baseline/MANIFEST/tipos gerados; mapa de arquitetura, `.changes` e relatório próprios. Não editar UI nesta tarefa.

**Read:** AGENTS.md, CLAUDE.md; skill Supabase; migrations 0222/0223, `app/actions/onboarding/{_shared,ensaio,createDefaultAgent}.ts`, `lib/onboarding/ensaio.ts`, `lib/ai/elegibilidade/pre-go-live.ts`, RPC `fn_configurar_pre_go_live_canal` e validações canônicas de publicação. Mapa somente leitura em `.superpowers/mapa-conexao-final.md` se já disponível.

**Interfaces:**

- `confirmarAgenteRevisado(input)` recebe `expected_context`, `expected_revision`, `expected_version_id`, `run_id`. Identidade vem de `requireOnboardingCtx`; resultado DTO `{ok:true, agent_id, version_id}` ou erro normalizado. RPC `fn_confirmar_agente_revisado_onboarding` revalida com `fn_validar_ensaio_onboarding`, exige resultado concluído/revisado da execução corrente e snapshot igual. Grava `onboarding_state.ai` com IDs/revisão/run e marcador de novo fluxo, sem alterar atividade/publicação/canal. Retentativa idempotente e audit sem texto livre.
- `ativarAgenteParaTeste(input)` acrescenta `channel_session_id`. RPC `fn_ativar_agente_teste_onboarding` executa locks e revalida revisão confirmada, sessão da mesma org não arquivada, status WORKING e política canônica `ai_gate=allowlist`, `ai_gate_mode=pre_go_live`, números autorizados não vazios. Não aceita sessionName/status/metadata do cliente. Usa a versão preparada, sem duplicar agente; não troca agente ativo já vinculado nem default existente. Somente após todas as validações vincula/publica/ativa o agente preparado e grava recibo idempotente da ativação.
- O recibo deve distinguir prova histórica consumida de ensaio atual: publicar muda o snapshot e o validator antigo corretamente deixa de aceitar a versão como rascunho. Não relaxar esse validator para aceitar agente ativo. Retry da mesma ativação verifica identidade/recibo/estado publicado/canal e não duplica audit. Mudança posterior do usuário não é sobrescrita por retry.
- Publicação usa configuração ensaiada e verificações de modelo/credencial/prompt da base; não troca modelo por default. Não executar ferramentas, IA ou mensagens durante a transação. Não criar evento que dispare contato proativo.
- Estado antigo sem marcador continua parseável. Alteração de rascunho ou negócio deve tornar confirmação antiga não utilizável para ativar; revalidar no banco, não confiar em `onboarding_state.ai` isoladamente.

- [ ] RED: fixture real baseada em `onboarding-ensaio.test.ts`. Confirmar sem revisão falha; confirmar revisado mantém agente inativo e canal null; repetição não duplica audit. Ativar com outra org, papel revogado, org suspensa/concluída, revisão/run antigos, versão alterada, canal ausente/desconectado/arquivado, público aberto, lista vazia ou agente conflitante falha sem mutação parcial.

```ts
expect(await confirmarRevisado(f)).toMatchObject({agent_id:f.agent});
expect(await estadoDoAgente(f)).toMatchObject({is_active:false,published_version_id:null});
await expect(ativar(f, canalAberto)).rejects.toThrow();
expect(await estadoDoAgente(f)).toMatchObject({is_active:false,published_version_id:null});
```

- [ ] GREEN: implementar RPCs curtas e actions Zod/guard/context/CAS. Ativação autorizada publica exatamente a versão ensaiada, somente no canal escolhido; não altera outros agentes/canais nem libera público. Retry e concorrência não duplicam publicação/audit. Provar privilégios anon/authenticated negados/service_role permitido e isolamento duas organizações.
- [ ] Provar uma mutação SQL real em transação removendo uma validação crítica, mostrar aceitação indevida no mutante e rollback restaura recusa; não deixar mutante instalado.
- [ ] Rodar focados action + DB via harness existente, typecheck/lint de arquivos. Pedir ao pai janela para DB completo/geração local se necessário; não resetar volumes do E2E. Criar migration com CLI, aplicar somente banco local, regenerar tipos. Não executar suíte pesada em paralelo com pai.
- [ ] Documentar contratos/limites, auto-revisar diff, commit local só arquivos da tarefa, relatório com RED/GREEN/exit/logs. Pai fará revisão independente antes da UI.

## Task 2: Jornada visível, retomada e autorização explícita

**Ownership:** `lib/onboarding/passos.ts`, `app/onboarding/{page,layout}.tsx`, `welcome/`, `setup-ai/`, `connect-whatsapp/`, `_components/`, actions de welcome/skip/finish quando necessárias, schemas/rascunho/prompt se campos aprovados exigirem; `components/connections/ChannelAiAccess.tsx` com opção restrita aditiva sem mudar default dos consumidores; PT/ES; testes unitários do fluxo, `tests/e2e/troca-de-organizacao-tem-volta.spec.ts` ou nova spec listada no gate E2E; evidência, mapa, `.changes`, relatório. Não alterar contratos transacionais da Task 1 sem informar o pai.

**Requirements:**

- Boas-vindas com CTA criar agente + explorar; negócio preserva nome/descrição/fuso/aceite e valores ao voltar. Nome/objetivo/tom do agente com resumo contextual desktop lateral/celular abaixo. Confrontar segmento/objetivo com schema existente; se precisar campo opcional aditivo, não inventar enum comercial nem limite de negócio. Preservar teto técnico canônico e incluir novos campos na preparação/revisão para que alterações invalidem prova.
- Segmento reutiliza IDs e labels de `lib/onboarding/pacotes-de-funil.ts`, sem segunda taxonomia. `objetivo` é texto opcional para compatibilidade dos rascunhos antigos, distinto das regras da casa. Novo formulário o apresenta explicitamente; o limite total do prompt continua o canônico de20000, sem truncar silenciosamente texto para caber. Atualizar validação SQL strict de configuração e business snapshot por migration nova posterior à Task1, preservando dados anteriores sem backfill e comprovando invalidação ao editar qualquer campo novo.
- Primeiro acesso passa por negócio → agente/ensaio/revisão → conexão. Reordenar router, stepper e resumo coerentemente; não apenas PASSOS. Etapas complementares loja/funil/time não devem induzir envio nem substituir o ensaio por teste legado dependente de publicação. Continuar depois usa exploração, sem conclusão global falsa.
- Remover caminho de criação/publicação legado da UI do novo fluxo. Após revisão atual mostrar `Continuar para conexão`, chamando confirmação da Task 1. Dirty/erro/prova antiga bloqueiam continuação. Acesso direto à rota de conexão redireciona à pendência real sem loop.
- Listar canais existentes por identidade confiável; QR WORKING não autoativa nem autoconclui. Mostrar status conectado separado da permissão. Usar política/serviço de `ChannelAiAccess` em modo somente teste (sem botão liberar público nesta jornada), seleção do canal e números autorizados. Último botão distinto `Ativar para estes números de teste` chama Task 1. Avisar que habilita respostas reais somente aos números escolhidos; nenhum envio é feito pelo botão.
- Não marcar conexão feita com `sessionName/status` do navegador. Recibo de ativação é retomável; estado antigo permanece compatível e org já concluída não sofre mutações. Reabrir agente publicado dirige à gestão existente, não cria outro agente ou apaga revisão.
- Testar sucesso/falhas de actions no navegador com banco local e provider sintético HTTP exclusivo do harness, sem WhatsApp real. Canal sintético deve estar explicitamente declarado como fixture, não prova do transporte WAHA.

- [ ] RED unitário da ordem, retomada welcome, continuação sem revisão, dirty, falha, legado não invocado, ativação separada, estado antigo e PT/ES.
- [ ] GREEN UI e guards, preservando identidade visual e acessibilidade. Leia guias Next locais relevantes antes de editar componentes/rotas.
- [ ] E2E local: primeira entrada até versão restrita com fixture; refresh/voltar, duas abas, troca de org, convidado, teclado, 390px sem overflow. Assert no banco de nenhum agente ativo antes do último botão, versão igual à ensaiada, gate restrito depois, nenhum evento/mensagem enviado. Capturas sintéticas versionadas e citadas individualmente.
- [ ] Verificação focada, `pnpm gov:verify`, DB, build/E2E sequenciais coordenados; relatório distingue integração sintética de API/transporte real. Commit local e revisão independente.

## Ambiente e sequência de saída

Node/pnpm: `/Users/juansanches/.npm/_npx/2e6a4a8ac0b42ddf/node_modules/.bin`; Docker/Colima em `/opt/homebrew/bin`. CLI Supabase `/Users/juansanches/.npm/_npx/98af39c2e6cc769d/node_modules/supabase/bin/supabase`.
Supabase local em `/tmp/zapfloo-onboarding-e2e.KooVaP`, projeto `zapfloo-onboarding-e2e`, Postgres17; invariantes usam pg15 efêmero. Não imprimir startup/keys e não ler `.env.e2e`; harness pode consumi-lo. Não parar Docker globalmente.

Após as tarefas, controlador executa revisão total e gates no candidato estável (incluindo todos os E2E aplicáveis, shell e três imagens amd64). Só então prepara a publicação privada sem Actions pago, conforme autorização posterior do usuário que substitui o limite antigo sem-deploy da spec. Esta autorização não se estende aos implementadores. Antes da VPS: conferir release atual e recuperação; manter imagem anterior e dados; nenhum rollback destrutivo.
