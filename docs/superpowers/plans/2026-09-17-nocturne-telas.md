# Nocturne Telas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar o conteúdo Nocturne a `/app`, `/app/inbox`, `/app/kanban` e à nova `/app/metas`, usando somente dados reais, os papéis existentes e os motores atuais do produto.

**Architecture:** Quatro fatias independentes serão implementadas em paralelo e integradas apenas depois: painel por papel, sugestões da IA, quadro com abas e metas operacionais. Leituras novas usam Route Handlers autenticados e tenant-scoped; metas persistem dentro de `organizations.settings`, sem tabela ou migration. Uma fase final centraliza navegação, i18n, mapa vivo, E2E e evidências para evitar conflitos nos arquivos compartilhados.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6, TanStack Query, Zod 4, Supabase/Postgres com RLS, Vitest 4, Playwright 1, Phosphor Icons e CSS/Tailwind 4 já existentes.

**Spec:** Pedido aprovado “redesign Nocturne, LEVA 2 — as telas” e `/Users/juansanches/Documents/ChatGPT/design-zapfloo/Zapfloo CRM.dc.html` (referência visual; dados demo e gamificação não são contrato).

## Global Constraints

- A branch é `codex/nocturne-telas`, criada de `origin/main` em `77f183612` e já publicada antes da primeira alteração.
- Nenhuma migration, tabela, papel ou permissão nova; não tocar em `supabase/`, `.github/`, `Caddyfile`, `docker*` ou `lib/billing/`.
- Todo número exibido vem de consulta real do tenant ou de `organizations.settings`; erro/ausência resulta em omissão ou estado “não definido”, nunca zero inventado.
- Papéis continuam `viewer < agent < manager < admin`; a composição usa `roleAtLeast`/`ROLE_RANK` e os guards de backend existentes.
- Sugestão de IA nunca envia mensagem; uma única chamada produz no máximo três opções e o clique apenas preenche o composer.
- Metas são operação, não jogo: nenhum XP, nível, ofensiva, desafio, ranking, ponto ou medalha.
- O mock `.dc.html` orienta composição e ícones, mas seus arrays, valores e cópias gamificadas são dados fictícios e não entram no produto.
- Nenhum hex novo fora de `app/globals.css`; a casca Nocturne existente é reutilizada sem mudar tema padrão.
- Cada mutação mantém guard, validação Zod, filtro explícito de `organization_id` quando usar service role e audit log.
- Nenhum agente paralelo edita `lib/i18n/dicionario.ts`, `lib/navigation/registry.ts`, `.changes/`, `docs/testing/user-journey-map.md`, `docs/architecture/` ou specs E2E; esses arquivos pertencem à integração final.
- Os quatro implementadores trabalham na mesma branch e não revertem alterações de outros; cada um possui exclusivamente os arquivos listados em sua tarefa.

---

### Task 1: Painel por papel com métricas reais

**Files:**
- Create: `app/api/v1/dashboard/summary/route.ts`
- Create: `app/api/v1/dashboard/summary/route.test.ts`
- Create: `lib/dashboard/role-summary.ts`
- Create: `lib/dashboard/role-summary.test.ts`
- Modify: `components/dashboard/useDashboard.ts`
- Modify: `components/dashboard/Dashboard.tsx`
- Modify: `components/dashboard/dashboard.module.css`
- Modify: `tests/unit/dashboard.test.tsx`

**Interfaces:**
- Consumes: `ConversationCounts`, `/api/v1/metrics/attendants`, `crm_leads.value_cents/status/closed_at`, `crm_stages.is_won`, `channel_sessions.status`, `organization_members`, `organization_subscriptions` e tarefas abertas do tenant.
- Produces: `DashboardSummary` com `role_surface: "agent" | "manager" | "admin"`, `hero` e `cards`; cada cartão tem `id`, `label`, `value`, `variation`, `hint` e `icon`, e só existe quando a fonte real foi lida com sucesso.

- [ ] **Step 1: Escrever os testes vermelhos da composição por papel**

  Em `lib/dashboard/role-summary.test.ts`, construir payloads sentinela e provar:

  ```ts
  expect(buildRoleSummary("agent", fontes).hero.value).toBe(7);
  expect(buildRoleSummary("manager", fontes).cards.map((card) => card.id)).toEqual([
    "pipeline_value",
    "won_revenue",
    "average_ticket",
    "first_response",
    "conversations_per_attendant",
  ]);
  expect(buildRoleSummary("admin", fontes).cards.map((card) => card.id)).not.toContain(
    "billing",
  );
  expect(JSON.stringify(buildRoleSummary("manager", fontes))).not.toContain("8940");
  ```

  O teste deve também provar que uma fonte `undefined` omite o cartão em vez de renderizar `0`.

- [ ] **Step 2: Rodar o teste e confirmar o vermelho**

  Run: `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm vitest run lib/dashboard/role-summary.test.ts`

  Expected: FAIL porque `buildRoleSummary` e `DashboardSummary` ainda não existem.

- [ ] **Step 3: Implementar o agregador puro sem literals de demo**

  Em `lib/dashboard/role-summary.ts`, definir tipos monetários por moeda e um builder que recebe somente valores já calculados:

  ```ts
  export type DashboardSurface = "agent" | "manager" | "admin";

  export interface DashboardCard {
    id: string;
    label: string;
    value: string | number;
    variation: string;
    hint: string;
    icon: "users" | "timer" | "chat" | "warning" | "money" | "trend" | "receipt" | "shield" | "whatsapp" | "seat";
  }

  export function buildRoleSummary(
    surface: DashboardSurface,
    sources: DashboardSources,
  ): DashboardSummary { /* somente projeção, sem consulta */ }
  ```

  Regras explícitas:

  - `agent`: fila, primeira resposta, conversas atribuídas e tarefas atrasadas; omitir `daily_goal`, porque não existe meta diária persistida.
  - `manager`: pipeline aberto, receita ganha no mês por `closed_at`, ticket médio, primeira resposta e conversas por atendente.
  - `admin`: instâncias online/total, assentos ativos/limite quando o limite existir e primeira resposta; omitir consumo unificado e faturamento porque não há consumo/fatura canônicos.
  - Moedas diferentes nunca são somadas. Se houver mais de uma, produzir grupos por moeda ou omitir o agregado com motivo observável no payload.

- [ ] **Step 4: Implementar a rota tenant-scoped**

  `GET /api/v1/dashboard/summary` resolve o usuário e a org ativa de fonte confiável, escolhe a superfície com `roleAtLeast`, e executa somente as consultas necessárias àquela superfície. O mês usa intervalo UTC semiaberto `[inícioDoMês, inícioDoPróximoMês)`; tarefas atrasadas exigem `due_date < now()` e status aberto; receita exige `status = won` e `closed_at` dentro do mês.

  A resposta mantém snake_case:

  ```ts
  return ok({ role_surface, hero, cards, omitted }, { requestId });
  ```

  `omitted` contém apenas IDs/motivos técnicos seguros, nunca PII.

- [ ] **Step 5: Testar isolamento, papel e ausência honesta na rota**

  Em `route.test.ts`, mockar as consultas e provar:

  - organização A nunca agrega linha da organização B;
  - agent não consulta faturamento/instâncias org-wide;
  - manager soma apenas ganhos fechados no mês e não mistura moedas;
  - admin não fabrica consumo ou fatura;
  - erro numa fonte omite o cartão dependente e preserva os independentes.

  Run: `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm vitest run app/api/v1/dashboard/summary/route.test.ts lib/dashboard/role-summary.test.ts`

  Expected: PASS.

- [ ] **Step 6: Trocar o dashboard para o contrato por papel**

  `useDashboard.ts` consulta o novo summary com chave incluindo org, usuário e papel. `Dashboard.tsx` renderiza hero, CTA e cartões genericamente, preserva `AiServiceStatus`, estados de erro honestos e detalhes existentes úteis. Usar Phosphor via `@/lib/ui/icons`; nenhuma condicional replica consulta do servidor.

- [ ] **Step 7: Criar a cerca contra número inventado**

  Em `tests/unit/dashboard.test.tsx`, devolver sentinelas únicas da API (`731`, `R$ 12.345`, `4m 17s`) e exigir que cada valor renderizado seja um deles; exigir que `R$ 8.940`, `94%`, `68%` e `128.400` não apareçam. A sabotagem final trocará um valor por literal e este teste precisa falhar.

- [ ] **Step 8: Rodar testes focados e commit**

  Run: `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm vitest run tests/unit/dashboard.test.tsx lib/dashboard/role-summary.test.ts app/api/v1/dashboard/summary/route.test.ts`

  Expected: PASS.

  ```bash
  git add app/api/v1/dashboard/summary components/dashboard lib/dashboard tests/unit/dashboard.test.tsx
  git commit -m "feat: adaptar painel ao papel com dados reais"
  ```

### Task 2: Sugestões de resposta da IA no composer

**Files:**
- Modify: `lib/agent-engine/agent/draft-reply.ts`
- Modify: `lib/agent-engine/agent/draft-reply.test.ts`
- Modify: `app/api/v1/conversations/[id]/draft-reply/route.ts`
- Create: `app/api/v1/conversations/[id]/draft-reply/route.test.ts`
- Modify: `hooks/inbox/useDraftReply.ts`
- Modify: `components/inbox/composer/DraftReplyButton.tsx`
- Modify: `components/inbox/Composer.tsx`
- Modify: `tests/unit/draft-reply-button.test.tsx`
- Create: `tests/unit/inbox-sugestoes-ia.test.tsx`

**Interfaces:**
- Consumes: o agente publicado, o ponto `draft_suggestion`, o contexto CRM curado e `runModelCall()` já usados por `generateDraftReply`.
- Produces: `POST /api/v1/conversations/[id]/draft-reply` → `{ data: { suggestions: string[] } }`, de zero a três opções; `onSuggestions(string[])` e seleção que chama o `applyDraft()` existente.

- [ ] **Step 1: Escrever o teste vermelho do domínio**

  Em `draft-reply.test.ts`, provar uma única chamada, parser de 1–3 opções, remoção de vazias/duplicadas e corte em três:

  ```ts
  expect(runModelCall).toHaveBeenCalledTimes(1);
  expect(result).toEqual({ ok: true, suggestions: ["Resposta A", "Resposta B", "Resposta C"] });
  ```

  Ausência de agente retorna `suggestions: []` sem chamar modelo.

- [ ] **Step 2: Rodar e confirmar vermelho**

  Run: `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm vitest run lib/agent-engine/agent/draft-reply.test.ts`

  Expected: FAIL porque o contrato atual devolve um único draft.

- [ ] **Step 3: Evoluir o motor existente em uma chamada**

  O prompt pede JSON estrito com `suggestions`, o parser valida strings não vazias, normaliza espaços, deduplica e corta em três. Não aceitar IDs do body; manter busca por conversa `id + organization_id`, agente publicado por org/canal e contexto existente. Não salvar o conteúdo das sugestões.

- [ ] **Step 4: Tornar apenas ausências configuracionais silenciosas**

  A rota devolve 200 com `[]` para `no_agent`, `LlmNotConfiguredError` e erro normalizado `credencial_recusada`. Bloqueio LGPD, orçamento, timeout e indisponibilidade geral continuam visíveis pelo tratamento atual. Preservar a precedência do ponto `draft_suggestion`; não forçar `selectionMode: "explicit"` e não ignorar binding administrativo.

- [ ] **Step 5: Testar rota e tenancy**

  Provar RBAC agent+, conversa da outra org recusada, `[]` silencioso para agente ausente/credencial inválida e zero exposição de prompt/token no corpo.

  Run: `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm vitest run 'app/api/v1/conversations/[id]/draft-reply/route.test.ts'`

  Expected: PASS.

- [ ] **Step 6: Renderizar até três chips sem envio automático**

  `useDraftReply` usa `retry: false`; `DraftReplyButton` entrega a lista; `Composer` mostra os chips acima do campo apenas quando houver opções. Clique chama `applyDraft(texto)`; o botão de envio não é acionado e o textarea continua editável.

- [ ] **Step 7: Provar o gesto humano**

  Em `inbox-sugestoes-ia.test.tsx`, clicar em “Resposta B”, verificar o texto no textarea, editá-lo e confirmar que `send` continua com zero chamadas até o clique explícito de enviar. Lista vazia não renderiza faixa nem toast.

- [ ] **Step 8: Rodar testes focados e commit**

  Run: `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm vitest run lib/agent-engine/agent/draft-reply.test.ts 'app/api/v1/conversations/[id]/draft-reply/route.test.ts' tests/unit/draft-reply-button.test.tsx tests/unit/inbox-sugestoes-ia.test.tsx`

  Expected: PASS.

  ```bash
  git add lib/agent-engine/agent/draft-reply.ts lib/agent-engine/agent/draft-reply.test.ts app/api/v1/conversations hooks/inbox/useDraftReply.ts components/inbox tests/unit/draft-reply-button.test.tsx tests/unit/inbox-sugestoes-ia.test.tsx
  git commit -m "feat: sugerir respostas revisaveis no inbox"
  ```

### Task 3: Funis com abas, totais e ações diretas

**Files:**
- Modify: `app/app/kanban/page.tsx`
- Modify: `app/app/kanban/_client.tsx`
- Create: `app/app/kanban/_components/KanbanWorkspace.tsx`
- Modify: `app/app/pipelines/[id]/_client.tsx`
- Modify: `app/api/v1/pipelines/[id]/board/route.ts`
- Create: `app/api/v1/pipelines/[id]/board/summary.test.ts`
- Modify: `lib/kanban/types.ts`
- Modify: `lib/types/leads.ts`
- Modify: `lib/kanban/card-state.ts`
- Modify: `lib/kanban/card-state.test.ts`
- Modify: `components/kanban/KanbanBoard.tsx`
- Modify: `components/kanban/StageColumn.tsx`
- Modify: `components/kanban/KanbanCard.tsx`
- Modify: `components/kanban/KanbanCardActions.tsx`
- Create: `tests/unit/kanban-nocturne.test.tsx`

**Interfaces:**
- Consumes: lista org-scoped de `crm_pipelines`, snapshot do board, `crm_leads.status/value_cents/currency/closed_at/stage_changed_at/source/contact_id`, `contacts.full_name` e as rotas existentes de move/win.
- Produces: `/app/kanban?pipeline=<uuid>` com tabs; `BoardData.summary` por moeda e `Lead.contact` derivado; callbacks `advance` e `win` reutilizando as mutations existentes.

- [ ] **Step 1: Escrever testes vermelhos dos totais**

  Em `board/summary.test.ts`, congelar relógio e provar:

  ```ts
  expect(summary.open_by_currency.BRL).toBe(125000);
  expect(summary.won_month_by_currency.BRL).toBe(42000);
  expect(summary.won_month_by_currency.USD).toBe(9000);
  ```

  Ganho anterior ao mês e lead perdido ficam fora; moedas permanecem separadas.

- [ ] **Step 2: Rodar e confirmar vermelho**

  Run: `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm vitest run 'app/api/v1/pipelines/[id]/board/summary.test.ts'`

  Expected: FAIL porque `BoardData.summary` ainda não existe.

- [ ] **Step 3: Enriquecer o snapshot sem N+1 e com escopo explícito**

  A rota carrega contatos em lote pelos `contact_id` do mesmo `organization_id`, anexa somente `{ id, full_name }`, calcula resumo por moeda e devolve `stage_changed_at` real. Nenhuma consulta aceita org do body/query.

  ```ts
  export interface BoardSummary {
    open_by_currency: Record<string, number>;
    won_month_by_currency: Record<string, number>;
  }
  ```

- [ ] **Step 4: Transformar `/app/kanban` no workspace sem apagar gestão**

  As tabs vêm da lista ordenada do servidor; o funil selecionado vem de `?pipeline=` se pertencer à org, senão do default/primeiro. Trocar tab usa navegação sem recarregar a shell. O fluxo existente de criar/importar/renomear/arquivar continua alcançável em uma área “Gerenciar funis” dentro da mesma rota; não remover `FunisClient` nem suas ações.

- [ ] **Step 5: Mostrar header e colunas reais**

  Header exibe “Pipeline aberto” e “Ganho no mês” por moeda; sem valor, mostra estado textual sem fabricar `R$ 0`. Cada coluna exibe contador e soma dos cards daquela coluna, também separando moedas. O botão passa a dizer “Novo negócio” e abre o `NewLeadDialog` existente.

- [ ] **Step 6: Completar card e ações**

  Card mostra título, contato quando houver, valor, dono, idade calculada por `stage_changed_at`, origem e os slots atuais. “Avançar” move para a próxima etapa não terminal na ordem; “Ganhar” chama a rota/hook existente que move para a etapa `is_won`. Em etapa terminal, não prometer avanço inexistente.

- [ ] **Step 7: Testar sem regressão de drag/drop e moeda**

  `kanban-nocturne.test.tsx` prova tabs, resumo, contato ausente honesto, moeda separada, avanço e ganho; os testes atuais de `card-state`, encerramento e lote continuam verdes.

- [ ] **Step 8: Rodar testes focados e commit**

  Run: `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm vitest run tests/unit/kanban-nocturne.test.tsx lib/kanban/card-state.test.ts 'app/api/v1/pipelines/[id]/board/summary.test.ts' lib/leads/encerramento.test.ts app/app/kanban/_client.test.tsx`

  Expected: PASS.

  ```bash
  git add app/app/kanban 'app/app/pipelines/[id]/_client.tsx' 'app/api/v1/pipelines/[id]/board/route.ts' 'app/api/v1/pipelines/[id]/board/summary.test.ts' lib/kanban lib/types/leads.ts components/kanban tests/unit/kanban-nocturne.test.tsx
  git commit -m "feat: transformar funis em quadro com abas"
  ```

### Task 4: Metas operacionais em `organizations.settings`

**Files:**
- Create: `lib/metas/config.ts`
- Create: `lib/metas/config.test.ts`
- Create: `app/api/v1/settings/goals/route.ts`
- Create: `app/api/v1/settings/goals/route.test.ts`
- Create: `app/api/v1/goals/progress/route.ts`
- Create: `app/api/v1/goals/progress/route.test.ts`
- Create: `hooks/metas/useGoals.ts`
- Create: `hooks/metas/useGoalProgress.ts`
- Create: `app/app/metas/page.tsx`
- Create: `app/app/metas/_components/MetasClient.tsx`
- Create: `tests/unit/metas-operacionais.test.tsx`

**Interfaces:**
- Consumes: `organizations.settings.operational_goals`, ganhos por `crm_leads.closed_at/owner_user_id/value_cents/currency` e conversas por `conversations.assigned_at/assigned_to_user_id`; nomes apenas para manager/admin por fonte autorizada.
- Produces: goals config defensiva, `GET/PATCH /api/v1/settings/goals`, `GET /api/v1/goals/progress` e tela agent+; manager/admin editam, agent apenas lê o próprio escopo.

- [ ] **Step 1: Escrever o schema vermelho e fixar a forma**

  Em `lib/metas/config.test.ts`, provar default vazio, validação de moeda/inteiros e targets individuais opcionais:

  ```ts
  const parsed = operationalGoalsSchema.parse({
    team: { monthly_revenue_cents: 5000000, monthly_conversations: 300 },
    members: { [userId]: { monthly_revenue_cents: 800000, monthly_conversations: 60 } },
  });
  expect(parsed.members[userId]?.monthly_conversations).toBe(60);
  ```

  Meta ausente continua `null`/omitida; nunca vira zero.

- [ ] **Step 2: Rodar e confirmar vermelho**

  Run: `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm vitest run lib/metas/config.test.ts`

  Expected: FAIL porque o schema ainda não existe.

- [ ] **Step 3: Implementar config e rota de leitura/escrita**

  `GET` exige agent e devolve defaults defensivos; `PATCH` exige manager, valida Zod, faz merge não destrutivo de `settings` e filtra `organizations.id = activeOrg.orgId` no admin client. Registrar `goals.config_changed` com apenas presença/contagens, não valores pessoais desnecessários.

- [ ] **Step 4: Testar RBAC, merge e idempotência**

  Provar agent GET 200/PATCH 403, manager PATCH 200, chave irmã preservada, org distinta intocada e payload inválido 422.

  Run: `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm vitest run app/api/v1/settings/goals/route.test.ts`

  Expected: PASS.

- [ ] **Step 5: Implementar progresso mensal real por escopo**

  A rota usa mês UTC corrente; soma ganhos por usuário e moeda e conta conversas atribuídas no período. Agent recebe apenas sua linha pela RLS/guard; manager/admin recebe equipe. Valores sem target retornam `target: null`, não `0`. Não ordenar como ranking; preservar ordem nominal/roster.

- [ ] **Step 6: Testar progresso e isolamento**

  Provar intervalo semiaberto, ganho sem `closed_at` excluído, duas moedas separadas, org B excluída, agent sem visão da equipe e pessoa sem atividade presente com atual `0` somente quando o roster real existe.

- [ ] **Step 7: Implementar `/app/metas` sem gamificação**

  Server page exige agent+ e passa `canManage` por `roleAtLeast`. A tela tem resumo da equipe, duas barras operacionais (receita mensal e conversas atendidas) e linhas por pessoa. Manager/admin veem formulário; agent vê somente leitura. Não renderizar posição, prêmio, XP, troféu ou competição.

- [ ] **Step 8: Testar UI e commit**

  Em `metas-operacionais.test.tsx`, provar edição só manager/admin, agent read-only, meta ausente “Meta não definida”, dados reais do payload e ausência das palavras proibidas.

  Run: `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm vitest run lib/metas/config.test.ts app/api/v1/settings/goals/route.test.ts app/api/v1/goals/progress/route.test.ts tests/unit/metas-operacionais.test.tsx`

  Expected: PASS.

  ```bash
  git add lib/metas app/api/v1/settings/goals app/api/v1/goals hooks/metas app/app/metas tests/unit/metas-operacionais.test.tsx
  git commit -m "feat: adicionar metas operacionais sem gamificacao"
  ```

### Task 5: Integração compartilhada, i18n, navegação e sistema vivo

**Files:**
- Modify: `lib/navigation/registry.ts`
- Modify: `tests/unit/navegacao-registry.test.ts`
- Modify: `lib/i18n/dicionario.ts`
- Modify: `tests/unit/idioma-da-interface.test.ts`
- Modify: `tests/unit/i18n-espanhol-cobre-a-tela.test.ts`
- Modify: `docs/testing/user-journey-map.md`
- Modify: `docs/architecture/dashboard.architecture.json`
- Create: `docs/architecture/metas-operacionais.architecture.json`
- Modify: `tests/unit/mapas-de-arquitetura.test.ts` somente se o contrato enumerar mapas explicitamente
- Create: `.changes/nocturne-telas.md`

**Interfaces:**
- Consumes: as quatro implementações e todos os novos textos renderizados.
- Produces: porta `/app/metas` no grupo compacto EQUIPE antes de Relatórios, traduções espanholas, mapas com entrada/saída e fragmento `capacidade_nova`.

- [ ] **Step 1: Atualizar a navegação com teste vermelho primeiro**

  Alterar a expectativa exata para:

  ```ts
  ["equipe", "Metas", "/app/metas"],
  ["equipe", "Relatórios", "/app/metrics"],
  ```

  Provar `minRole: "agent"`, agent vê, viewer não vê, e Chat interno continua ausente até sua tela existir.

  Run: `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm vitest run tests/unit/navegacao-registry.test.ts tests/unit/navegacao-completude.test.ts`

  Expected before implementation: FAIL por rota sem porta/área ausente. Expected after: PASS.

- [ ] **Step 2: Inserir destino e área compacta**

  Adicionar `CompactAreaId = "metas"`, destino `/app/metas` no grupo de análise com seção operacional apropriada e área principal `section: "equipe"`, antes de Relatórios. Não adicionar Chat interno ou Suporte interno sem tela.

- [ ] **Step 3: Consolidar todos os textos no dicionário**

  Buscar chaves antes de inserir, adicionar espanhol para cada rótulo novo e evitar chaves iguais a nomes semeados de etapa. Rodar:

  `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm vitest run tests/unit/idioma-da-interface.test.ts tests/unit/i18n-espanhol-cobre-a-tela.test.ts`

  Expected: PASS e zero chave duplicada.

- [ ] **Step 4: Atualizar mapa vivo e jornada**

  `dashboard.architecture.json` passa a apontar de fontes tenant-scoped para a composição por papel e desta para inbox/kanban/connections. O novo mapa de metas tem entrada `organizations.settings.operational_goals`, entrada de fatos `crm_leads/conversations`, saída `/app/metas` e retorno `goals.config_changed`; no mínimo duas arestas reais. O mapa de jornadas registra painel por papel, sugestão editável, tabs/ganho e metas agent/manager.

- [ ] **Step 5: Criar fragmento**

  `.changes/nocturne-telas.md` declara `capacidade_nova` e efeito no operador: painel adapta-se ao papel, inbox sugere respostas revisáveis, funis ganham abas e metas operacionais passam a ter tela; nenhuma ação manual.

- [ ] **Step 6: Rodar gates focados e commit**

  Run: `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm vitest run tests/unit/navegacao-registry.test.ts tests/unit/navegacao-completude.test.ts tests/unit/idioma-da-interface.test.ts tests/unit/i18n-espanhol-cobre-a-tela.test.ts tests/unit/mapas-de-arquitetura.test.ts && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm release:conferir`

  Expected: PASS.

  ```bash
  git add lib/navigation/registry.ts lib/i18n/dicionario.ts tests/unit docs/testing/user-journey-map.md docs/architecture .changes/nocturne-telas.md
  git commit -m "docs: integrar navegacao e contratos nocturne"
  ```

### Task 6: E2E, evidência visual e sabotagem viva

**Files:**
- Modify: `tests/e2e/redesign-operacional.spec.ts`
- Create: `.superpowers/evidence/nocturne-telas/dashboard-agent.png`
- Create: `.superpowers/evidence/nocturne-telas/dashboard-manager.png`
- Create: `.superpowers/evidence/nocturne-telas/dashboard-admin.png`
- Create: `.superpowers/evidence/nocturne-telas/dashboard-agent.json`
- Create: `.superpowers/evidence/nocturne-telas/dashboard-manager.json`
- Create: `.superpowers/evidence/nocturne-telas/dashboard-admin.json`
- Create: `.superpowers/evidence/nocturne-telas/sabotagem-dashboard.txt`

**Interfaces:**
- Consumes: UI integrada e seeds do E2E.
- Produces: prova browser dos quatro fluxos e três pares screenshot/JSON com SHA-256 + cor computada do mesmo estado.

- [ ] **Step 1: Confirmar que a spec existente continua no CI**

  Rodar o gate `tests/unit/e2e-cobertura-completa.test.ts` e confirmar que `redesign-operacional.spec.ts` continua em `SPECS_PARTE_*`. Não criar spec nova e não tocar `.github/`.

- [ ] **Step 2: Escrever os cenários E2E**

  Provar pela tela:

  - agent/manager/admin veem hero, CTA e conjunto de cartões próprios;
  - sugestões aparecem, clicar preenche e não envia;
  - alternar tab troca funil, “Avançar” move, “Ganhar” chega à etapa `is_won`;
  - manager salva metas e agent as vê sem controles de edição;
  - nenhuma palavra de gamificação aparece.

- [ ] **Step 3: Gerar evidência amarrada**

  Para cada papel, depois de aguardar os dados reais, coletar no mesmo passo:

  ```ts
  const measured = await page.evaluate(() => ({
    href: location.href,
    theme: document.documentElement.dataset.theme ?? null,
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    dashboardBackground: getComputedStyle(document.querySelector("main")!).backgroundColor,
  }));
  ```

  Tirar PNG, calcular SHA-256 do arquivo e escrever JSON contendo `screenshot_sha256`, `bodyBackground`, `dashboardBackground`, papel e timestamp. Valor de fundo nulo reprova.

- [ ] **Step 4: Executar sabotagem de número inventado**

  Trocar temporariamente um cartão derivado por literal `"R$ 8.940"`, executar o teste focado e salvar saída vermelha em `sabotagem-dashboard.txt`. Restaurar a fonte real e rerodar verde. A alteração sabotada nunca entra no commit.

- [ ] **Step 5: Rodar E2E e commit de evidência**

  Run: `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm playwright test tests/e2e/redesign-operacional.spec.ts`

  Expected: todos verdes, screenshots presentes e hashes conferindo via `shasum -a 256`.

  ```bash
  git add tests/e2e .superpowers/evidence/nocturne-telas
  git commit -m "test: provar telas nocturne por papel"
  ```

### Task 7: Verificação integral, revisão, push e PR

**Files:**
- Modify: apenas correções causais encontradas pelos gates; não abrir escopo.

**Interfaces:**
- Consumes: todos os commits anteriores.
- Produces: branch limpa e remota, PR contra `main`, comandos e omissões relatados.

- [ ] **Step 1: Rodar suites canônicas sem esconder o rodapé**

  ```bash
  COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NODE_OPTIONS=--max-old-space-size=4096 corepack pnpm gov:verify > /tmp/nocturne-gov.log 2>&1
  COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm test:unit > /tmp/nocturne-unit.log 2>&1
  grep -aE "^ *Test Files |^ *Tests " /tmp/nocturne-unit.log | tail -2
  grep -acE "^ *FAIL " /tmp/nocturne-unit.log
  ```

  Expected: exits 0; rodapé zero failed; contagem `FAIL` coerente.

- [ ] **Step 2: Rodar navegação, contraste e build**

  Run: `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm vitest run tests/unit/navegacao-completude.test.ts tests/unit/branding-contraste.test.ts tests/unit/tema-padrao.test.tsx tests/unit/e2e-cobertura-completa.test.ts && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm build`

  Expected: PASS; tema claro continua padrão.

- [ ] **Step 3: Rodar E2E completo**

  Run: `COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm test:e2e`

  Expected: suite completa verde. Qualquer vermelho é investigado por causa; não marcar flaky, skip ou excluir.

- [ ] **Step 4: Revisão final adversarial**

  Revisar tenancy, RBAC, ausência de dados demo, envio não automático, moedas separadas, gamificação ausente, metas sem migration, i18n, a11y e mobile 390px. Corrigir apenas achados dentro do escopo e rerodar seus testes.

- [ ] **Step 5: Push e abrir PR**

  ```bash
  git status --short
  git push origin codex/nocturne-telas
  gh pr create --repo juansanchees/zapfloo-crm --base main --head codex/nocturne-telas --title "feat: aplicar Nocturne às telas operacionais" --body-file <arquivo-do-corpo>
  ```

  O corpo inclui: comandos/saídas, sabotagem vermelha, hashes das três imagens, cartões omitidos e por quê, Living System Checklist e “não fiz” (sem merge, versão, deploy, migration, gamificação ou dados inventados).
