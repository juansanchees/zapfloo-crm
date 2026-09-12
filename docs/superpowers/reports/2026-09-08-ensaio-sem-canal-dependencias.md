# Ensaio antes de conectar — dependências verificadas

Data: 2026-09-08. Inspeção local em `codex/onboarding-roxo`, base `22620d85`.
Este documento registra evidências para a próxima implementação; não afirma que ela existe.

## Confirmado

| Peça | Código | Consequência |
| --- | --- | --- |
| Persistência da versão | `supabase/baseline.sql`, tabela `ai_agent_versions` | Antes da 0220, `channel_session_id` era NOT NULL. A 0220 local permite null em draft/archived, mantendo canal obrigatório para published/superseded. API/UI ainda precisam do novo caminho de criação. |
| Criação atual no wizard | `app/actions/onboarding/createDefaultAgent.ts` | Cria/atualiza agente ativo e tenta publicar primeira versão. Não reutilizar essa action como “salvar rascunho”. |
| Tela de ensaio | `app/onboarding/testar/page.tsx` | Resolve `published_version_id`; a tela não oferece hoje a versão draft. |
| API de ensaio | `app/api/v1/ai/agents/[id]/versions/[vid]/test/route.ts` | Filtra versão por organização/agente, cria execução dry-run, aceita versão independentemente de estar publicada. Não exige conversa/contato de verdade. |
| Runtime chamado pela API | `lib/ai/runtime/agent.ts` | Está deprecated e proíbe novas features. Dry-run não busca transporte da conversa; usa mensagem sintética. Não equivale automaticamente ao runtime canônico do worker. |
| Prova simulada | Mesma rota, `runStubbedTest` | Grava status completed, com marcador `(stub)` nas ferramentas e flag `stub` na resposta. Completed sozinho não é comprovação de IA real. |
| Publicação canônica | `fn_publish_ai_agent_version` no baseline, última definição | Exige credencial da organização validada, canal WORKING e modelo ativo. A criação direta do wizard tem comportamento diferente quanto a chave da instalação. Não afrouxar essa função silenciosamente. |
| Estado do wizard | `patchOnboardingState` em `_shared.ts` | Read/merge/write compartilhado, sem controle de revisão concorrente. Não é suficiente para provar que a revisão corresponde ao rascunho atual. |
| Autorização do canal | `fn_configurar_pre_go_live_canal`, migration 0218 | Atualiza modo e lista de teste atomicamente. Lista vazia em pre-go-live bloqueia respostas. Reutilizar, não criar outro formato de autorização. |

## Contratos que a próxima implementação precisa provar

- Salvar dados sem chave/canal não pode ativar agente, escrever memória publicada ou liberar público.
- Alteração de rascunho invalida a revisão anterior, inclusive sob duas abas concorrentes.
- Prova de revisão vem de uma execução da mesma organização e revisão, concluída com resposta não vazia; stub/falha/resposta antiga não contam.
- Comparar somente o ID da versão não prova que o conteúdo é o mesmo: versões draft são editáveis pela API existente. A implementação deve vincular a execução ao conteúdo efetivamente ensaiado e recusar revisão depois de uma edição concorrente; não basta guardar um booleano no cliente.
- Conexão não ativa atendimento. Publicação e autorização explícita de contato precisam preservar bloqueio do público e políticas de atendimento humano/STOP.
- Não alterar o modelo ou chave escolhidos pelo operador; ausência de configuração precisa aparecer como pendência real.
- Organizações já configuradas e estados legados são preservados; nenhuma migração aplicada é editada.
- Mudança de schema exige migration via CLI, apêndice idempotente do baseline, MANIFEST, tipos gerados e testes locais de isolamento/idempotência.

## Limite da evidência atual

Nenhuma chamada real de IA, conexão WAHA/Meta ou publicação de atendimento foi feita neste lote. A migration 0220 foi aplicada somente ao banco local e aos bancos efêmeros de teste; o remoto permanece intocado.
O desenho aprovado segue sendo referência visual, não evidência dessas integrações.
