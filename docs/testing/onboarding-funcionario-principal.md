# Funcionário principal no onboarding

Escopo autorizado em 13/set/2026: corrigir a marca `ai_agents.is_default` na
ativação restrita e reparar organizações existentes pelo recibo comprovado. Sem
release, deploy, edição de configuração ou alteração de política de atendimento.

## Causa e fronteira da correção

`app/actions/onboarding/montarQuadro.ts::cerebroDoFuncionario` procura o agente
principal. A preparação cria corretamente um rascunho inativo e não principal,
mas a ativação publicava esse agente sem atribuir a marca quando faltava um
principal. O leitor então confundia ausência da marca com ausência de funcionário.

A promoção pertence à transação `fn_ativar_agente_teste_onboarding`, depois das
validações do ensaio e da publicação. Não deve ser antecipada para a preparação,
nem executada como segunda chamada depois de uma ativação já concluída. A disputa
pelo índice `ai_agents_one_default_per_org` não pode desfazer a ativação.

## Auditoria de todos os leitores e escritores

Busca: `git grep -n -E 'is_default|isDefault' -- app components hooks lib workers
scripts supabase tests`. Separação por tabela e uso real, não por comentário.

| Superfície | Uso e efeito da correção |
|---|---|
| `app/actions/onboarding/montarQuadro.ts` | O cérebro passa a resolver o funcionário ativado quando antes faltava o principal. O leitor não recebe fallback novo. |
| `app/actions/onboarding/createDefaultAgent.ts` | Escritor legado sem chamador de produto encontrado na base auditada. Se voltar a ser chamado, reaproveita o principal existente. A afirmação de escritor exclusivo precisa acompanhar o novo escritor SQL. |
| `app/actions/onboarding/ensaio.ts` | Recuperação exige agente preparado inativo, não principal e não publicado. Não se promove rascunho. |
| `app/onboarding/testar/page.tsx` | Ensaio legado lê o principal; a jornada `reviewed_draft_v2` é redirecionada antes dessa busca. |
| `app/api/v1/ai/agents/[id]/route.ts` | DELETE já recusa principal com 409. O promovido passa a receber essa proteção. |
| `app/app/ai/agents/_actions.ts` | `archiveAgentAction` já recusa principal com `cannot_archive_default`. O promovido passa a receber essa proteção. |
| `app/app/ai/agents/_components/AgentCard.tsx` | A lista exibe o badge `Padrão`. |
| `components/ai/AgentEditor.tsx` | Editor legado exibe a marca somente para leitura; o agente MCP do onboarding usa o editor próprio. |
| `app/app/ai/usage/page.tsx` | Principal primeiro no seletor, sem mudar cálculo de custos ou escopo. |
| `workers/ai-response-worker.ts` | Ordenação prioriza principal, mas o publicado não se torna elegível ao worker legado; o engine mantém a responsabilidade pelo atendimento publicado. |
| API de agentes, páginas de lista/detalhe e `hooks/ai/useAgent.ts` | Projeções REST/RSC e tipo transportam a marca para a interface. Não concedem acesso nem decidem envio. |
| `lib/ai/agents/duplicate.ts` | Lê a fonte, mas força a cópia a continuar não principal. |
| POST de agentes e `app/app/ai/agents/[id]/_actions.ts` | Criação manual continua não principal. |
| RPCs de preparação, validação de ensaio e recuperação | Recusam rascunho já principal/ativo/publicado; não se alteram esses contratos. |
| Índice `ai_agents_one_default_per_org` | Conta qualquer principal, inclusive inativo ou arquivado. Não se troca o dono da marca. |

Falsos positivos confirmados:

- Agenda (`app/api/v1/agenda/agendamentos/_handler.ts`) e relatório de atividades
  (`app/api/v1/reports/activities/route.ts`) consultam `crm_pipelines.is_default`.
- Demais APIs de funis, Leads/Kanban, vinculação de atividade, escalação e MCP de
  funis também usam a marca do funil, não a do agente.
- Catálogo/modelos e bootstrap usam `ai_models.is_default_for_provider`.
- `lib/ai/agents/agente-da-conversa.ts`, worker de sentimento, indexador e tela de
  fontes carregam comentários históricos sobre principal, não seleção atual por
  essa marca. O engine resolve por versão publicada, canal e prioridade.
- Seeds e QA podem criar principal explícito como fixture; não são o caminho do
  assinante. `is_default_branch` do workflow é metadado do GitHub.

## Dados existentes e limites deliberados

A correção dos registros existentes exige o recibo `restricted_activation`, a
auditoria correspondente e o vínculo exato com o agente e sua versão publicada.
Não escolhe por idade, nome, único agente aparente ou IDs fixos. Não altera
ativação, publicação, canal, fila ou números autorizados. Um canal posteriormente
aberto pelo operador não é fechado novamente pela correção da marca.

O NOTICE informa organizações promovidas, ignoradas por principal existente,
ignoradas por falta de evidência e organizações com principal arquivado. O último
contador é diagnóstico separado, não uma quarta categoria mutuamente exclusiva.

**Defeito conhecido, fora de escopo:** `montarQuadro` consulta principal sem
filtrar `archived_at`. Um principal arquivado pode ser usado como cérebro. Esta
leva apenas conta e reporta esse caso; não desarquiva, substitui ou muda o leitor.
O menu de arquivamento também não foi redesenhado: o backend continua recusando
arquivamento do principal.

## Restrição do atendimento

O engine seleciona agente por publicação e canal, não por `is_default`. A restrição
vigente está na metadata de `channel_sessions`: `ai_gate`, `ai_gate_mode` e
`ai_test_phone_numbers`. Ela é relida na elegibilidade e no envio/reenvio. Não se
cria outro mecanismo de teste.

Ressalva preexistente e não corrigida: erro de leitura da elegibilidade em `drain`
e `inbound-turn` pode permitir processamento antes do sink final, que bloqueia o
envio. Não se promete ausência de gasto de IA em falha de banco.

## Living System Checklist

| Pergunta | Artefato concreto |
|---|---|
| Entrada | `ativarAgenteParaTeste` + RPC com revisão, versão, canal e recibo verificados. Para os registros existentes: recibo e `api_audit_log`. |
| Saída | `ai_agents.is_default` alimenta `cerebroDoFuncionario`, lista de agentes e proteções existentes de exclusão/arquivamento. |
| Log | Ativação mantém `onboarding.restricted_activation`. Cada promoção também emite `ai_agents.updated` pelo trigger existente `trg_ai_agents_audit`; reaplicar sem efeito não emite outro update. Correção de dados informa contagens por NOTICE. |
| Tela | Passo de quadro deixa de cair no pacote por ausência da marca; lista mostra `Padrão`. |
| Porta | Jornada de onboarding e `/app/ai/agents` existentes; nenhuma tela/rota nova. |
| Anti-morte | Principal é eleito na ativação; reparo idempotente alcança registros anteriores comprovados. Perder a disputa não perde a ativação. |
| Configuração | Preparar, testar, revisar e ativar permanecem na jornada; lista autorizada continua na conexão. A marca automática não cria escolha técnica nova. |
| Continuidade IA/humano | Mesma versão revisada, mesmo canal e mesmos gates; nenhum novo handoff ou envio. |
| Laço de retorno | Recibo/auditoria validam estado persistido e correção posterior. Revisão do quadro continua humana. Não há aprendizado ou alteração automática de treinamento nesta correção. |
| Mapa | `docs/architecture/onboarding-ativacao-restrita.architecture.json`: ativação → agente principal → leitor do quadro. |

## Provas e não medido

Provas executadas em Node 22, banco local descartável e baseline INSTALL + UPDATE:

| Prova | Resultado medido |
|---|---|
| `corepack pnpm gov:verify` completo | Exit 0: typecheck, lint, lint:channels, lint:role-rank e 759 arquivos / 7.897 testes unitários aprovados. |
| `corepack pnpm test:db --reporter=verbose` completo | Exit 0: baseline INSTALL + UPDATE, 169 arquivos / 1.380 casos aprovados. Um skip preexistente de rate limit em `webhooks-inbound.test.ts:539`, já presente em `origin/main`; nenhum skip novo. |
| `onboarding-concluir`, `onboarding-principal-backfill` e `onboarding-principal-restricao` | 3 arquivos, 38 casos verdes; incluem principal preexistente/arquivado, retry e concorrência. |
| Retirar a promoção inicial | Mesmo teste vermelho: `is_default:false` em vez de `true`. |
| Retirar somente a promoção do retry | Mesmo teste vermelho: marca não recuperada; versão/recibo continuam sendo os originais. |
| Retirar captura da colisão no índice | Mesmo teste vermelho: `23505`, `ai_agents_one_default_per_org`, rotina `_bt_check_unique`. |
| Retirar exigência da auditoria no reparo | Mesmo teste vermelho: promove 3 organizações em vez de 2; o recibo sem auditoria passa indevidamente. Restauração: 1/1 verde. |
| Retirar guarda pré-go-live do reenvio | Mesmo teste vermelho: 2 envios HTTP em vez de 1. Restauração: 1/1 verde e diff do runtime zerado. |
| Duas jornadas de site válido do #14 | Mesmas specs, verde 2/2 → promoção sabotada, vermelho 2/2 → restauração, verde 2/2. |
| Duas jornadas com a ordem final do baseline | Baseline inteiro reaplicado; mesmos dois nomes, 2/2 aprovados em 32,5s, exit 0. |

O teste de concorrência usa duas transações e observa o bloqueio. **Somente o
escritor adversarial** usa `SET LOCAL session_replication_role=replica` para não
serializar a disputa antes do índice pelos triggers de auditoria/FK. O índice único
permanece ativo; a sessão da ativação mantém todas as guardas e auditorias. A primeira
sonda testava um bloqueio anterior: a sabotagem revelou o falso verde e a prova foi
corrigida, sem alteração de produto para acomodá-la.

Na matriz sintética de 15 organizações, o NOTICE capturado foi:

```text
onboarding_funcionario_principal: promovidas=2, ignoradas_por_default=2, ignoradas_por_falta_de_evidencia=11, defaults_arquivados=1
onboarding_funcionario_principal: promovidas=0, ignoradas_por_default=4, ignoradas_por_falta_de_evidencia=11, defaults_arquivados=1
```

A segunda linha é a reaplicação. Publicação, estado ativo, canal e lista ficaram
idênticos. As duas promoções geraram dois `ai_agents.updated` pelo trigger existente;
a reaplicação não gerou outros. Esses números **não são de produção**.

A prova de restrição cria o agente pelas RPCs reais, confirma a promoção por SQL e
PostgREST, executa a consulta de elegibilidade e o `redriveQueued` até um receiver
HTTP local: autorizado recebe um envio; externo, mesmo anteriormente autorizado,
recebe zero e fica `failed/pre_go_live`. As respostas enfileiradas e o resultado do
ensaio são fixtures. Isso não é prova de inbound completo, LLM comercial, pareamento
ou entrega num celular; tampouco exercita o sink inicial `sendMessageHandler`.

A prova das duas jornadas de site do PR #14 usa integração local isolada, sem mudar
as specs ou `montarQuadro`. A branch do #14 só será atualizada depois que esta
correção entrar na main. Logs literais, comandos e medidas estão em
`.superpowers/evidence/funcionario-principal/`, incluindo `provas-banco.md` e
`e2e/RELATORIO.md`; o PR reproduz os vermelhos relevantes.

As suítes completas rodaram neste worktree de correção, não no checkout principal.
Logs finais: `gov-verify-concluido.log` e `test-db-completo.log`. A integração E2E
temporária terminou em `a4eeabd4a452d52bba317e4ddb243a9e6b26b0ed`; o #14 permaneceu
em `fd36bec8304aef955a41b400eca1e414db16c989` sem modificações. Traces e JSON de
Playwright permanecem locais por conterem sessões descartáveis de autenticação;
logs selecionados e capturas de dados sintéticos acompanham a evidência versionada.

Uma rodada de fixture original falhou com `rehearsal_invalid_result`; a causa não
foi confirmada e os retestes passaram. Foi acrescentado diagnóstico temporal, sem
alterar timestamps ou afrouxar a validação. A primeira execução completa também
detectou o apêndice depois da varredura final de permissões; os blocos foram movidos
para antes dela e o guardião original passou novamente (3 arquivos, 16 casos).

Não há consulta a produção, contagem real dos tenants em produção, WhatsApp
comercial, consumo de IA comercial, release ou deploy nesta tarefa.
