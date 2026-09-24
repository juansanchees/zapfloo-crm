# Monetizze Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` task-by-task. Every access rule and
> postback transition must use `superpowers:test-driven-development`; no
> production implementation may precede its failing test.

**Goal:** Integrar assinaturas mensais da Monetizze ao Zapfloo, ativar planos por
postback e aplicar um bloqueio comercial reversível, desligado por padrão, sem
perder mensagens recebidas nem bloquear administradores da plataforma.

**Architecture:** Um ledger server-only recebe e deduplica webhooks; uma RPC
transacional projeta eventos válidos em `organization_subscriptions`; uma função
pura central decide o acesso e possui adaptadores Supabase/worker. O bloqueio é
defesa em profundidade: shell redireciona navegação, APIs mutáveis recusam e os
sinks de IA/outbound param antes de produzir saída, enquanto ingestão permanece
intacta. A plataforma controla rollout e concilia compras não vinculadas.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6, Supabase/Postgres
15 com RLS, Redis/fallback de rate limit, Vitest 4, Playwright 1, Zod 4 e pnpm
9.15.9 em Node 22.

**Spec:** `docs/superpowers/specs/2026-09-24-cobranca-monetizze.md`.

## Global constraints

- Branch `codex/cobranca-monetizze`, criada de `origin/main` em `7896071d` e
  publicada vazia antes da primeira alteração.
- Próxima migration provável `0239`; reconfirmar no início da Task 3.
- Nenhuma linha existente em `organization_subscriptions` será alterada pela
  migration. Colunas novas são nullable e o legado continua utilizável.
- `enforcement_enabled` nasce `false`; migration e código de instalação nunca o
  ligam.
- Preços/limites em `lib/billing/planos.ts` não mudam.
- Fixture real é pré-condição da implementação do parser. Não criar fixture
  sintética como substituto.
- Segredos e payload bruto não entram em log, audit, fixture, HTML ou resposta.
- Todo acesso via service role filtra `organization_id` obtido de fonte confiável.
- Arquivos compartilhados (`baseline.sql`, `MANIFEST.md`, `database.types.ts`,
  `dicionario.ts`, `.changes/`, workflows E2E e mapas vivos) pertencem à fase de
  integração; implementadores não os editam em paralelo.
- Cada tarefa termina com teste focado verde e commit pequeno. O controlador não
  corrige código do implementador: envia revisão e pede correção ao mesmo agente.

---

### Task 1: Capturar e congelar o contrato real do postback

**Files:**
- Create: `tests/fixtures/monetizze/postback-teste-real.json`
- Create: `docs/integrations/monetizze.md`
- Create: `lib/billing/monetizze/fixture-contract.test.ts`

- [ ] **Step 1: Entrar somente pelo login feito pelo dono**

  Abrir Ferramentas → Webhook/Postback no painel antigo. Se ele pedir login,
  parar; o agente nunca digita senha nem usa credencial salva.

- [ ] **Step 2: Preparar o receptor local seguro**

  Criar primeiro um teste vermelho que exige captura sem segredo e sem PII. O
  receptor temporário deve gravar o corpo somente em diretório ignorado e nunca
  commitá-lo bruto.

- [ ] **Step 3: Pedir confirmação no momento do disparo**

  O clique “Enviar teste” é ação externa. Mostrar produto/eventos/URL selecionados
  e pedir confirmação imediatamente antes do clique.

- [ ] **Step 4: Anonimizar por forma, não por invenção**

  Preservar nomes de campo, tipos, aninhamento, valores de status/evento e
  presença/ausência. Substituir chave, e-mail, nome, documento, telefone, IDs e
  URLs pessoais por sentinelas reconhecíveis.

- [ ] **Step 5: Escrever o contrato da fixture**

  O teste deve conferir ao menos `id`, `data`, `chave_unica`, `codigo_venda`,
  `codigo_status`, `postback_evento`, produto, venda, assinatura quando presente,
  comprador e `venda.src`. Cada campo usado ganha fonte na documentação oficial e
  indicação “observado na fixture real”.

  Run:
  `corepack pnpm exec vitest run lib/billing/monetizze/fixture-contract.test.ts`

  Expected: PASS com zero sentinela parecida com segredo ou dado pessoal real.

- [ ] **Step 6: Commit**

  `git commit -m "test: fixar contrato real do postback Monetizze"`

---

### Task 2: Definir domínio puro de eventos e acesso comercial

**Files:**
- Create: `lib/billing/acesso-comercial.ts`
- Create: `lib/billing/acesso-comercial.test.ts`
- Create: `lib/billing/monetizze/eventos.ts`
- Create: `lib/billing/monetizze/eventos.test.ts`
- Modify: `lib/billing/planos.ts`
- Modify: `tests/unit/planos.test.ts`

- [ ] **Step 1: RED — matriz de acesso**

  Testar tabela inteira:

  - teste antes/depois de `created_at + 7 dias`;
  - ativo até `paid_through + 3 dias`;
  - recusado/cancelado até o mesmo limite;
  - pausado bloqueado;
  - bloqueio desligado libera vencidos, exceto decisão explícita `pausado`;
  - platform admin sempre liberado;
  - legado ativo sem datas continua liberado e aparece como `legacy_unreviewed`.

  A função pura retorna `{ allowed, reason, access_until, enforcement_enabled }`.

- [ ] **Step 2: Confirmar o vermelho**

  Run:
  `corepack pnpm exec vitest run lib/billing/acesso-comercial.test.ts`

  Expected: FAIL porque o módulo ainda não existe.

- [ ] **Step 3: GREEN mínimo**

  Implementar datas com mês-calendário UTC a partir do último pagamento
  confirmado, nunca `30 dias` fixos. Não consultar banco nesta função.

- [ ] **Step 4: RED — mapeamento de eventos**

  Usar a fixture real para testar:

  - 2/101 → `ativo` e novo período pago;
  - 102 → `recusado`, preservando último período pago;
  - 3/4/5/9/103 → `cancelado`, preservando último período pago;
  - 104 e evento desconhecido → registrado/ignorado;
  - produto desconhecido → `ignored_unknown_product`;
  - evento antigo nunca regride estado novo.

- [ ] **Step 5: Implementar projeção pura e rerodar**

  Run:
  `corepack pnpm exec vitest run lib/billing/acesso-comercial.test.ts lib/billing/monetizze/eventos.test.ts tests/unit/planos.test.ts`

  Expected: PASS.

- [ ] **Step 6: Sabotagens focadas**

  Remover os três dias de tolerância e confirmar vermelho. Depois permitir evento
  antigo e confirmar vermelho. Restaurar e registrar as saídas.

- [ ] **Step 7: Commit**

  `git commit -m "feat: centralizar regra de acesso comercial"`

---

### Task 3: Criar schema 0239 e transação idempotente

**Files:**
- Create: `supabase/migrations/20260924HHMMSS_0239_cobranca_monetizze.sql`
- Modify: `supabase/baseline.sql`
- Modify: `supabase/migrations/MANIFEST.md`
- Modify: `lib/database.types.ts`
- Create: `tests/invariants/cobranca-monetizze.test.ts`
- Modify: `tests/invariants/rls-isolation.test.ts`

- [ ] **Step 1: Reconfirmar numeração e dados existentes**

  Verificar maior migration e testar, num Postgres descartável, que todos os
  status existentes pertencem a `teste|ativo|pausado`. Qualquer outro valor para
  a tarefa e exige relatório antes de criar constraint.

- [ ] **Step 2: RED — invariantes do schema**

  Testar instalação e reaplicação, RLS, grants e defaults:

  - CHECK aceita `recusado` e `cancelado` e rejeita desconhecido;
  - interruptor existe e começa desligado;
  - anon/authenticated não leem nem escrevem ledger/configuração;
  - service role pode processar;
  - unique `(sale_code, sale_status)` e unique `webhook_id`;
  - função transacional não é executável por public/anon/authenticated;
  - nenhuma linha anterior tem plano/status/datas alterados.

- [ ] **Step 3: Implementar migration forward-only**

  Evoluir `organization_subscriptions` com campos nullable de origem, assinatura
  externa, último pagamento, período pago e `access_until`. Criar:

  - `platform_billing_settings` singleton, `enforcement_enabled=false`;
  - `billing_provider_events` server-only com payload normalizado, hash de e-mail,
    e-mail mascarado, organização opcional, desfecho e erro seguro;
  - RPC `fn_processar_evento_monetizze` atômica, protegida e monotônica.

  O raw body não fica no banco. IDs externos entram em metadata de audit, nunca
  como `resource_id` não UUID.

- [ ] **Step 4: Tripla e tipos**

  Repetir o SQL como apêndice idempotente no baseline, registrar 0239 no MANIFEST
  e regenerar `database.types.ts` pela ferramenta do repo, nunca à mão.

- [ ] **Step 5: Provar instalação/reaplicação**

  Run:
  `corepack pnpm test:db -- tests/invariants/cobranca-monetizze.test.ts`

  Depois rodar `corepack pnpm test:db` completo.

- [ ] **Step 6: Sabotagem**

  Remover uma unique e confirmar duplicata; mudar default do interruptor para
  true e confirmar vermelho; restaurar.

- [ ] **Step 7: Commit**

  `git commit -m "feat(db): persistir cobranca Monetizze com rollout seguro"`

---

### Task 4: Parser, autenticação e rota pública do postback

**Files:**
- Create: `lib/billing/monetizze/parser.ts`
- Create: `lib/billing/monetizze/parser.test.ts`
- Create: `lib/billing/monetizze/auth.ts`
- Create: `lib/billing/monetizze/auth.test.ts`
- Create: `lib/billing/monetizze/processar.ts`
- Create: `lib/billing/monetizze/processar.test.ts`
- Create: `app/api/v1/webhooks/monetizze/route.ts`
- Create: `app/api/v1/webhooks/monetizze/route.test.ts`
- Modify: `lib/env.ts`
- Modify: `.env.example`
- Modify: `.env.hostgator.example`

- [ ] **Step 1: RED — JSON e form reais**

  O parser nasce dos campos observados na fixture. Testar JSON e form, aliases
  documentados, falta de campo obrigatório e zero retenção de PII desnecessária.

- [ ] **Step 2: RED — chave e rate limit**

  Provar chave ausente/inválida recusada, comparação com comprimentos diferentes
  sem lançar, route fail-closed sem env e limite excedido com 429/Retry-After.

- [ ] **Step 3: Implementar comparação em tempo constante**

  Normalizar para bytes de tamanho fixo com hash e usar `timingSafeEqual`. Nunca
  logar o valor recebido ou configurado.

- [ ] **Step 4: Implementar rota**

  Ler corpo uma vez, parsear JSON/form, autenticar `chave_unica`, limitar por IP
  e hash da conta, validar Zod, normalizar, processar pela RPC e responder `ok()`.
  Duplicata conhecida retorna 200 sem repetir efeitos; erro transitório retorna
  código retriável sem revelar interior.

- [ ] **Step 5: Env e packaging**

  Adicionar as sete variáveis server-only a `lib/env.ts`, `.env.example` e
  `.env.hostgator.example`. Sem `NEXT_PUBLIC_`. Rodar `env-example-sync` e
  `test:shell`.

- [ ] **Step 6: Sabotagens obrigatórias**

  - chave inválida aceita → teste vermelho;
  - remover unique/claim e enviar duplicata → vermelho;
  - mapear produto desconhecido → vermelho.

- [ ] **Step 7: Rodar e commit**

  Run:
  `corepack pnpm exec vitest run lib/billing/monetizze app/api/v1/webhooks/monetizze/route.test.ts tests/unit/env-example-sync.test.ts`

  Expected: PASS.

  `git commit -m "feat: receber postbacks autenticados da Monetizze"`

---

### Task 5: Resolver organização e fila de conciliação

**Files:**
- Create: `lib/billing/monetizze/checkout-reference.ts`
- Create: `lib/billing/monetizze/checkout-reference.test.ts`
- Create: `lib/billing/monetizze/resolver-organizacao.ts`
- Create: `lib/billing/monetizze/resolver-organizacao.test.ts`
- Create: `app/api/v1/admin/billing/unmatched/route.ts`
- Create: `app/api/v1/admin/billing/unmatched/[id]/link/route.ts`
- Create: corresponding route tests
- Modify: `lib/audit/actions.ts`

- [ ] **Step 1: RED — referência opaca**

  Provar assinatura, adulteração, expiração e contexto. O token contém UUID,
  timestamp e nonce, mas não é confiado antes da verificação.

- [ ] **Step 2: RED — ordem de resolução**

  Testar: `src` válido vence; e-mail só casa um admin/uma org; zero ou múltiplos
  resultados geram fila; body não consegue escolher UUID diretamente.

- [ ] **Step 3: Implementar resolvedor**

  Consultas service role sempre verificam membership `admin` e organização. O
  ledger guarda apenas hash e forma mascarada do e-mail.

- [ ] **Step 4: API da fila**

  Platform admin lista pendências e vincula uma delas uma única vez. A ação abre
  transação, projeta o evento, registra before/after e audita ator, data e motivo.
  Duplo clique é conflito idempotente, não dupla ativação.

- [ ] **Step 5: Sabotagem**

  Remover fallback para fila e confirmar que compra não casada reprova. Forçar
  primeiro match em e-mail ambíguo e confirmar vermelho. Restaurar.

- [ ] **Step 6: Run e commit**

  `corepack pnpm exec vitest run lib/billing/monetizze/checkout-reference.test.ts lib/billing/monetizze/resolver-organizacao.test.ts app/api/v1/admin/billing`

  `git commit -m "feat: conciliar compras Monetizze com organizacoes"`

---

### Task 6: Aplicar a função única de acesso sem perder inbound

**Files:**
- Modify: `lib/billing/assinatura.ts`
- Create: `lib/billing/acesso-server.ts`
- Create: `lib/billing/acesso-server.test.ts`
- Modify: `app/app/layout.tsx`
- Modify: `app/api/v1/messages/_handler.ts`
- Modify: `workers/media-derive-worker.ts`
- Modify: `lib/agent-engine/edge/llm/credentials.ts`
- Modify: pontos diretos de modelo descobertos no mapa do runtime
- Create/modify: focused tests for each seam

- [ ] **Step 1: Inventariar sinks novamente**

  Reexecutar busca por `generateText|generateObject|embed|transcribe|sendMessage`
  e listar todos os caminhos que geram custo ou saída. O inventário é guardado em
  `docs/architecture/cobranca-monetizze.architecture.json`.

- [ ] **Step 2: RED — shell e exceções**

  Provar que, com switch ligado e acesso vencido, qualquer `/app/*` redireciona
  para billing, exceto billing e logout; switch desligado não redireciona;
  platform admin nunca redireciona.

- [ ] **Step 3: RED — inbound preservado**

  Postar mensagem e mídia com organização bloqueada e provar raw arquivado,
  conversa/mensagem/mídia persistidas e nenhum envio disparado.

- [ ] **Step 4: RED — IA/outbound parados**

  Provar zero chamada de provider, zero derivação paga, zero linha outbound
  `queued` e zero envio WAHA/Meta para resposta/automação. Envio humano também é
  bloqueado pela regra aprovada “nenhuma mensagem sai”; a UI explica e aponta para
  billing. Aviso interno de plataforma não usa canal do tenant bloqueado.

- [ ] **Step 5: Implementar adaptadores da decisão pura**

  Supabase e workers `pg` carregam a mesma projeção e chamam
  `resolverAcessoComercial`. Nenhum seam reimplementa datas/status.

- [ ] **Step 6: Implementar defesas**

  - layout faz UX de redirecionamento;
  - APIs mutáveis retornam erro comercial tipado;
  - motor de IA consulta antes do provider;
  - sinks de outbound consultam antes de criar `queued`;
  - ingestão não consulta cobrança e continua idempotente.

- [ ] **Step 7: Sabotagens obrigatórias**

  - forçar switch desligado a bloquear → vermelho;
  - remover bypass do platform admin → vermelho;
  - bloquear/descartar inbound → vermelho;
  - remover gate de outbound → vermelho.

- [ ] **Step 8: Run e commit**

  Rodar os testes focados de layout, mensagens, WAHA/canais, media workers e LLM;
  depois `corepack pnpm test:unit`.

  `git commit -m "feat: aplicar bloqueio comercial sem perder mensagens"`

---

### Task 7: Construir Plano e pagamentos e links de checkout

**Files:**
- Modify: `app/app/settings/billing/page.tsx`
- Create: `app/app/settings/billing/_client.tsx`
- Create: `lib/billing/checkout.ts`
- Create: `lib/billing/checkout.test.ts`
- Modify: `lib/navigation/registry.ts`
- Modify: `components/shell/Sidebar.tsx` only if registry projection is insufficient
- Modify: `lib/i18n/dicionario.ts`
- Modify: related unit/E2E tests

- [ ] **Step 1: RED — checkout seguro**

  Testar URL por plano, `email` pré-preenchido segundo documentação oficial e
  `src` assinado; env ausente não produz link quebrado; URL configurada precisa
  ser HTTPS e host esperado de checkout.

- [ ] **Step 2: Implementar a tela com dados reais**

  Mostrar plano, situação, `access_until`, limites do catálogo e explicação do
  motivo. Três CTAs usam somente URLs/env e referência server-generated. Nunca
  colocar chave ou UUID cru no HTML.

- [ ] **Step 3: Rodapé fixo**

  Projetar Plano e pagamentos no mesmo grupo persistente de Configurações,
  mantendo alcançabilidade dos destinos. Medir 1280×768 e 1366×768.

- [ ] **Step 4: I18n e acessibilidade**

  Todo texto entra no dicionário PT/es. Provar foco, rótulos, contraste e estado
  sem checkout configurado.

- [ ] **Step 5: E2E da jornada**

  Cobrir trial, ativo, atraso, cancelado e bloqueado em desktop/390px; link
  preserva plano e nunca expõe segredo.

- [ ] **Step 6: Commit**

  `git commit -m "feat: entregar plano e pagamentos ao cliente"`

---

### Task 8: Construir o painel de cobrança da plataforma

**Files:**
- Create: `app/admin/(protected)/billing/page.tsx`
- Create: `app/admin/(protected)/billing/_client.tsx`
- Create: `app/api/v1/admin/billing/settings/route.ts`
- Create: `app/api/v1/admin/billing/organizations/route.ts`
- Modify: `components/admin/AdminSidebar.tsx`
- Modify: `lib/i18n/dicionario.ts`
- Create: focused tests and E2E

- [ ] **Step 1: RED — kill switch**

  Provar platform-admin-only, default off, confirmação explícita, audit com
  before/after e ator. Usuário de tenant e anon recebem 403/401.

- [ ] **Step 2: RED — revisão antes de ligar**

  A lista mostra todas as organizações com plano/status/acesso até e marca
  legado sem datas como “revisão necessária”. Paginação não omite organizações.

- [ ] **Step 3: Implementar UI operacional**

  Seções: interruptor, fila não vinculada e organizações. Ligar exige dialog que
  mostra contagens de vencidas, legado e pendências; não altera assinaturas.

- [ ] **Step 4: Provar conciliação de um clique**

  Vincular pendência atualiza a linha na lista e some da fila; segunda tentativa
  não duplica. Toda ação gera audit.

- [ ] **Step 5: Sabotagem**

  Retirar o default off e confirmar vermelho; remover audit e confirmar vermelho.

- [ ] **Step 6: Commit**

  `git commit -m "feat: operar cobranca no painel da plataforma"`

---

### Task 9: Sistema vivo, documentação e operação

**Files:**
- Create: `docs/architecture/cobranca-monetizze.architecture.json`
- Modify: `docs/testing/user-journey-map.md`
- Modify: `docs/billing/planos.md`
- Modify: `docs/index.md`
- Modify: `.changes/cobranca-monetizze.md`
- Modify: `lib/i18n/dicionario.ts`

- [ ] **Step 1: Living System Checklist**

  Registrar portas, superfícies, fluxos, workers, fonte de verdade, falhas
  visíveis, auditoria, métricas e procedimentos de recuperação. Atualizar índice.

- [ ] **Step 2: Runbook da Monetizze**

  Em português simples, documentar:

  1. criar/configurar os três produtos/planos mensais;
  2. copiar códigos e checkouts para env;
  3. cadastrar `/api/v1/webhooks/monetizze` em Ferramentas → Postback;
  4. selecionar eventos 2,3,4,5,9,101,102,103,104;
  5. usar JSON e chave única da conta;
  6. enviar teste e verificar o item no painel;
  7. revisar todas as organizações;
  8. só então ligar o interruptor.

- [ ] **Step 3: Fragmento**

  `.changes/cobranca-monetizze.md` com `capacidade_nova`, efeito no operador,
  variáveis por nome e sem valores. Não mexer em versão.

- [ ] **Step 4: Testes de documentação/i18n**

  Rodar gates de idioma, env, arquitetura, navegação e change fragment.

- [ ] **Step 5: Commit**

  `git commit -m "docs: documentar operacao da cobranca Monetizze"`

---

### Task 10: Sabotagem integrada, gates e evidência

**Files:**
- Create: `tests/e2e/cobranca-monetizze.spec.ts`
- Modify: `.github/workflows/e2e.yml` only to register the new spec, after explicit scope check
- Create: `.superpowers/evidence/cobranca-monetizze/*`

- [ ] **Step 1: E2E em banco fresco**

  Exercitar fixture real sanitizada pela rota pública e provar ativação,
  duplicata, produto desconhecido, fila, conciliação, switch off/on, bypass da
  plataforma, billing e inbound preservado.

- [ ] **Step 2: Registrar a spec no CI**

  Acrescentar à partição E2E sem removê-la ou marcá-la `FORA_DO_CI`. Esta é a
  única mudança permitida em `.github/` e será feita somente porque o gate exige
  registro explícito de toda spec.

- [ ] **Step 3: Nove sabotagens do aceite**

  Guardar saída vermelha de cada mutação temporária:

  1. chave inválida aceita;
  2. duplicata processada duas vezes;
  3. produto desconhecido ativa;
  4. compra sem match desaparece;
  5. switch off bloqueia vencido;
  6. switch on não bloqueia vencido;
  7. platform admin bloqueado;
  8. inbound descartado;
  9. recusa bloqueia antes dos três dias.

  Restaurar cada mutação antes da seguinte e confirmar verde novamente.

- [ ] **Step 4: Rodar gates completos em Node 22**

  ```bash
  corepack pnpm test:db
  corepack pnpm gov:verify
  corepack pnpm test:unit
  corepack pnpm test:shell
  corepack pnpm test:e2e
  corepack pnpm build
  ```

  Para Vitest, guardar o rodapé `Tests` e nomes de arquivos vermelhos; não usar
  pipe que esconda exit code.

- [ ] **Step 5: Revisão final por agente independente**

  O reviewer compara diff contra spec, procura caminho que descarte inbound,
  bypass de tenant, segredo/PII e falha-em-verde. Findings P0/P1/P2 precisam ser
  corrigidos e reverificados antes do PR.

- [ ] **Step 6: Commit, push e PR**

  Commit apenas evidência/documentação restante, push da branch e PR contra
  `main`. Não mesclar, versionar ou publicar. O corpo do PR inclui fontes
  oficiais, campos usados, outputs dos gates, nove sabotagens, setup Monetizze,
  envs por nome e o que não foi medido.

