# Leitor de site na configuração inicial

Implementação em `codex/leitor-de-site-no-onboarding`. Este documento separa
contrato implementado de prova executada; o resultado final fica nas evidências.

## Contrato

- O endereço é opcional no welcome. URL + intenção de leitura são gravados no
  mesmo estado do passo; o `after` lê em segundo plano. Se o processo encerrar
  antes do callback, o cron recupera a intenção. Nenhum passo aguarda o site.
- Seis tentativas HTTP por leitura (home + até cinco páginas úteis), contando
  redirecionamentos e falhas. É leitura inicial, não espelhamento de loja.
  Teto total: 30s, 6s por requisição, 512 KiB/página, 2 MiB/leitura, 100 produtos,
  50 perguntas. Não há navegador remoto nem modelo de IA na extração.
- Texto e DNS passam pelos guards existentes, a cada destino. Só HTTP(S)
  permitido pela política vigente, redirecionamento manual e orçamento comum.
  A resolução seguida de fetch conserva a limitação de DNS rebinding documentada
  no guard existente; não se afirma pinagem de socket por IP.
- Fonte tipo `site` nasce inativa. `status`/`last_index_status` mostram a leitura;
  metadata existente guarda lease, resumo, recusas e contagens. Produtos nascem
  `origem=site`, `ativo=false`. Confirmação não troca preço nem sobrescreve
  produto já aprovado. Preço ambíguo/divergente fica fora com motivo e linha.
- A sugestão do funil lê snapshot concluído e delimita o site como dado externo.
  Falha conserva pacote e motivo. `MAX_ETAPAS` e os passos permanecem intactos:
  seis definições, seis visíveis com loja habilitada; cinco sem a etapa de loja.
- Perguntas usam revisão existente, confirmação explícita, reserva concorrente
  da fonte e hash do conteúdo conferido. O indexador não usa o resumo bruto.
  Embeddings continuam dependendo da configuração já existente da instalação.
- Done apresenta apenas dados reais pendentes; Depois é persistido por
  organização no navegador. Revisar conclui o mesmo onboarding, preservando
  guards, e só permite destinos internos pré-definidos.

## Living System Checklist

| Propriedade | Artefato concreto |
|---|---|
| Entrada e consumidores | welcome → `site/servico.ts` → funil, catálogo e acervo |
| Porta | telas existentes `/app/products` e `/app/ai/knowledge/sources`; nenhuma tela órfã nova |
| Log real | estado da fonte + `knowledge_source.updated` e confirmação do catálogo em `api_audit_log` |
| Anti-interrupção | flag durável do welcome, cron no scheduler da VPS, CAS/lease e no máximo três tentativas |
| Falha e próximo passo | motivo legível na fonte, retry manual limitado, alternativa de conteúdo manual |
| Laço de retorno | pessoa corrige/confirma FAQ e preços antes de a IA usá-los; rascunho nunca habilita atendimento |
| Mapa vivo | `docs/architecture/onboarding-site.architecture.json` |
| Distribuição | app + scheduler publicados pelo CI existente; nenhuma variável nova, migration ou edição de `.env` |

## Provas e limites

Evidências locais: `.superpowers/evidence/onboarding-site/`. Sabotagens devem
registrar vermelho e restauração; um teste que só passa não prova a proteção.

- Catálogo: PostgREST e MCP reais; filtro `ativo=true` removido → vermelho.
- Persistência: banco do baseline; crawler controlado para concorrência e falha.
- Leitor: guards reais; transporte/DNS controlados nos testes, com erros, teto,
  destinos internos, redirecionamentos, stream lento e preços ambíguos.
- UI: componentes reais; remoção do after/intenção/dispensa/allowlist → vermelho.
- E2E: spec `onboarding-leitor-de-site.spec.ts`, receptores HTTP locais e preloads
  exclusivos do harness. Não comprova DNS/TLS de um site público, provedor pago
  de IA, pareamento de telefone ou envio real de WhatsApp.

Não implementado: renderização de sites dependentes de JavaScript; leitura de
redes sociais; extração de preço por adivinhação/IA; editor novo de preços
(a tela existente permite conferir/confirmar ou deixar o rascunho inativo).
Nenhuma operação de produção, deploy, release ou alteração de schema nesta leva.

## Fechamento após merge da main — 13/09/2026

Trabalho salvo em `6ecdfa260`; merge da main `f0fe5c865` em `f4f8ac35f`.
Integração automática, sem escolher um lado: conferência AST encontrou 5.338
chaves, nenhuma duplicada, mantendo conteúdo/ordem da main e os 71 acréscimos
do leitor. O mapa de jornadas preservou os acréscimos das duas branches.

| Concluído e testado | Pendente | Bloqueado |
|---|---|---|
| `corepack pnpm exec vitest run lib/onboarding/site/ lib/onboarding/passos.test.ts --reporter=verbose`: 5 arquivos, 63 casos, exit 0; inclui “o site opcional não cria um sétimo passo nem expõe loja desligada”. | Medição do PR pelo CI. | Não está pronto para merge: duas jornadas E2E falham no funil. |
| `corepack pnpm test:unit`: 772 arquivos, 8.027 casos, exit 0. | Corrigir o contrato entre o agente preparado/ativado e a seleção do agente usado pelo funil, em leva própria. | `montarQuadro.ts` exige `is_default=true`; a preparação cria o agente com `false` e a ativação restrita publica sem mudar essa marca. |
| `corepack pnpm test:db catalogo-site-so-cota-confirmado`: baseline install/update e 5 casos de PostgREST/MCP, exit 0. | Reexecutar os dois casos de site válido após esse conserto. | Ambos param antes de comprovar a sugestão baseada no site, done e revisão. |
| Build e typecheck pós-merge: exit 0. Spec `onboarding-leitor-de-site.spec.ts`: 3 passed, 2 failed, exit 1, sem skip; os três cenários verdes mediram 1280×844 e 390×844 sem transbordo. | | |

A única adaptação da spec ao merge foi exigir a ausência dos seletores técnicos
retirados pela main. Nenhum assert foi removido para esconder a falha do funil;
nenhuma regra de produto foi alterada nesta etapa de fechamento.

Sabotagem DNS repetida após o merge: retirar `assertDestinoResolvidoSeguro`
gerou **4 failed / 12 passed**, exit 1; restaurar devolveu **63 passed** no
recorte completo do leitor/passos, exit 0. O arquivo voltou exatamente ao
conteúdo commitado. As saídas literais ficam em `postmerge-dns-sabotado.log` e
`postmerge-dns-restaurado.log`. A sabotagem do catálogo de 12/09 está preservada
em `catalogo-db-sabotado.log` (1 failed / 4 passed, exit 1) e
`catalogo-db-restaurado.log` (5 passed). O corpo do PR inclui esses vermelhos,
não apenas a afirmação de que foram executados.

### O que não foi medido neste fechamento

- Conclusão/revisão pela tela nos dois cenários de site válido: bloqueados antes
  desses passos. Testes de componentes não substituem essa prova.
- Suíte completa de banco, lint e kit shell não foram repetidos após o merge;
  o recorte de banco acima não é apresentado como suíte completa.
- DNS/TLS públicos, IA comercial, embeddings externos, pareamento/envio real
  de WhatsApp, instalação/atualização na VPS e funcionamento em produção.
- CI ainda depende da execução do PR; verde local não o substitui.

## Revalidação após o PR #15 — 13/09/2026

O bloqueio das duas jornadas acima foi removido pela correção já mesclada na main.
`git fetch origin && git merge origin/main` integrou a main `3ceea3024` nesta branch
no commit `dc93da4ed`, sem conflitos. Spec e configuração do Playwright permanecem
idênticas a `fd36bec83`; nenhuma asserção ou regra de produto foi alterada nesta etapa.

No próprio worktree `codex/leitor-de-site-no-onboarding`, Node 22:

- Baseline inteiro reaplicado ao Supabase local de QA com `ON_ERROR_STOP=1`: exit 0.
- `corepack pnpm e2e:build`: exit 0, controle positivo do bundle em `127.0.0.1:56521`.
- `corepack pnpm exec playwright test tests/e2e/onboarding-leitor-de-site.spec.ts --grep 'site lido: (revisar|depois) é uma saída real e confirmar libera só o produto conferido' --workers=1 --reporter=list,json --trace on`: **2 passed (27.9s), exit 0**, sem skip ou retentativa.

Saída literal preservada em `.superpowers/evidence/onboarding-site/pos-pr15-e2e.log`;
preparação em `pos-pr15-baseline.log` e `pos-pr15-build.log`. O banco já era a stack
de QA instalada anteriormente: esta rodada não é prova de instalação fresca.
Receivers de site e IA são locais e sintéticos. JSON/traces ficam locais por
poderem conter cookies descartáveis. Não foram repetidas as outras três jornadas,
as suítes unitária/banco completas, nem testes em produção ou WhatsApp real.
