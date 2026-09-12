# Correções de produção — plano de execução

> **For agentic workers:** Use superpowers:executing-plans para executar cada ciclo; frentes independentes podem usar superpowers:dispatching-parallel-agents. Cada correção exige vermelho, verde e mutação.

**Goal:** Recuperar retenção de follow-ups durante reconexão e impedir que o copiloto ultrapasse a visibilidade da sessão.

**Architecture:** Reutilizar a fila de mensagens e o session-reconciler existentes. Na entrada HTTP do copiloto, usar o cliente autenticado, preservando o cliente administrativo do ingresso MCP com bearer.

**Tech Stack:** Node 22, pnpm 9.15.9, Next 16, Supabase/Postgres 15, Vitest.

**Spec:** Pedido do dono de 10/set/2026: defeitos 1 (follow-up pinado em canal religando) e 2 (copiloto bypassando RLS). Anexo 3–6 é opcional, não condiciona estas correções.

## Restrições globais

- Branch própria derivada de origin/codex/onboarding-roxo; gates dc175239b antes de qualquer correção.
- Não tocar main, VPS, deploy, .env ou .codex/config.toml. Não abrir PR.
- Nenhuma nova fila, retry próprio ou relaxamento das policies. Não mudar schema neste lote prioritário.
- Testes reais de banco via baseline, sem dados/credenciais de produção.
- Um fragmento .changes/ por correção; relatório com limites explícitos.

## 1. Follow-up durante reconexão

Arquivos: lib/agent-engine/agent/followup-turn.ts; testes de follow-up em tests/invariants/; .changes/2026-09-10-followup-reconexao.md.

- [x] Executar handler real com enrollment.conversation_id, canal STARTING e mensagem fixa. Exigir mensagem persistida queued, conclusão do job sem dead e mesmo channel_session_id.
- [x] Medir vermelho causado pelo throw de status, não por fixture incompleta.
- [x] Remover somente o veto de indisponibilidade transitória. Continuar recusando join de canal ausente/alheio e archived_at preenchido.
- [x] Exercitar redrive com a sessão WORKING e os controles negativos de organização/arquivamento.
- [x] Reintroduzir o throw, executar o teste e confirmar vermelho; restaurar e repetir verde.
- [x] Commit próprio com fragmento: `043eb8808`. Evidência no arquivo de fechamento.

## 2. Visibilidade do copiloto

Arquivos: app/api/v1/ai/ask/route.ts; tests/unit/ai-ask-route.test.ts; novo tests/invariants/copilot-visibilidade-sessao.test.ts; helper de PostgREST descartável em tests/db/; .changes/2026-09-10-copiloto-visibilidade.md.

- [x] Medir o mesmo conjunto de IDs via GET /conversations e POST /ai/ask, executando tools reais com seleção do modelo determinística e PostgREST local contra o baseline.
- [x] Fixtures: atendente sem atribuição, atendente com atribuição, manager/admin e outra organização. Controle positivo impede um vazio por erro passar.
- [x] Testar bearer api_tokens através do MCP real, preservando seu acesso explícito à organização.
- [x] Corrigir a entrada da sessão para `supabase: await createClient()` de lib/supabase/server; não modificar o ingresso bearer.
- [x] Reintroduzir createAdminClient na rota: o teste de visibilidade deve reprovar. Restaurar e repetir verde.
- [x] Commit próprio com fragmento: `d0c5be27a`. Evidência no arquivo de fechamento.

A revisão encontrou uma regressão nos nomes de responsáveis: corrigida com lookup privado de nomes mínimos, restrito a membros ativos da organização e IDs solicitados. Testes negativos e positivos adicionados, sem elevar o client das consultas.

## Fechamento

- [x] `corepack pnpm gov:verify` completo (Node 22), preservando log e exit real: 7.842 testes, exit 0.
- [x] `corepack pnpm test:db` completo, baseline install/update, sem editar invariantes enquanto roda: 1.362 passed, 1 skipped, exit 0. Após ajuste só de imports de tipo, 18/18 dos consertos passaram novamente.
- [x] Revisão independente dos diffs e testes. Ausência de alterações no schema e no arquivo privado do dono conferida.

Entrega autorizada: commits e push somente na branch própria, sem PR/merge/deploy. Relatório e logs completos em `.superpowers/evidence/correcoes-producao-2026-09-10/README.md` e `logs.tar.gz`. Anexo 3–6 permanece pendente. O relatório distingue prova local de produção, navegador, autenticação e provedor reais, não medidos neste lote.
