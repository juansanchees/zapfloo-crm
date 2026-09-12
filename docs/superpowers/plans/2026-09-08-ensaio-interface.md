# Ensaio na interface — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax for tracking.

**Goal:** Ligar o rascunho salvo à escolha explícita de modelo, ensaio de texto sem canal e revisão persistida, sem publicar atendimento.

**Architecture:** A preparação 0222 permanece a origem da versão. O ensaio captura o conteúdo preparado numa transação curta; a chamada de IA recebe esse snapshot, nunca relê uma versão mutável para montar o prompt. Finalização e revisão conferem organização, revisão e conteúdo novamente. A interface usa essas provas do servidor, não um booleano local.

**Tech Stack:** Next.js 16, React 19, Zod, Supabase/Postgres, camada canônica runModelCall, Vitest e Playwright.

**Spec:** docs/superpowers/specs/2026-09-08-primeiro-acesso-roxo.md

## Global Constraints

- Trabalho em `codex/onboarding-roxo`, sem deploy, sem usar credenciais de produção e sem enviar mensagens reais.
- Não fazer commit, push, merge, acessar VPS ou abrir `.env*`.
- Rascunho e alterações sobrevivem ao retorno; nenhum atendimento é ativado.
- Ensaio falho, indisponível ou referente a configuração antiga não libera a confirmação de revisão da configuração atual.
- Textos em português e espanhol acompanham a infraestrutura de tradução.
- Marca vem dos resolvedores canônicos de instalação/organização.
- Preservar alterações anteriores; esta entrega não reordena globalmente o wizard nem libera conexão ou publicação.
- Não reutilizar `runAgent` legado: sua ponte MCP não recebe `is_dry_run` e pode executar ferramentas reais. Ensaio novo é explicitamente de texto, sem tools, RAG ou validação do transporte.
- Não alterar modelo/chave da organização. A seleção pertence exclusivamente ao rascunho. Informar consumo de API antes do clique.
- Falhas de configuração, resposta vazia e simulação nunca viram sucesso revisável. Não usar INTERNAL_AGENT_RUN_STUB como prova.

## Task 1: Fluxo vertical de preparação, ensaio e revisão

**Files / ownership:**
- Criar `lib/onboarding/ensaio.ts`: DTOs Zod e estados de ensaio.
- Criar `lib/onboarding/executar-ensaio.ts`: adapter de texto à camada canônica; sem ferramentas.
- Criar `app/actions/onboarding/ensaio.ts`: leitura, início e revisão com contexto confiável.
- Criar `app/onboarding/setup-ai/_ensaio.tsx`: seleção, mensagem, resultado, limites e revisão; painel embutido, sem nova rota.
- Modificar `app/onboarding/setup-ai/_form.tsx` e `page.tsx`: conectar rascunho salvo ao painel e invalidar prova quando campos mudam; manter caminho legado distinto, não invocá-lo no ensaio.
- Migration 0223 criada via CLI, apêndice idêntico em baseline antes de VARREDURA anon, MANIFEST e tipos gerados.
- Testes `tests/unit/onboarding-ensaio*.test.ts(x)`, `tests/invariants/onboarding-ensaio.test.ts`, extensão de `tests/e2e/troca-de-organizacao-tem-volta.spec.ts`.
- Dicionário PT/ES, mapa de arquitetura, mapa de jornadas, `.changes` e relatório deste lote.
- A camada `lib/agent-engine/edge/llm/run-model-call.ts` pode receber opções opcionais de timeout/output e seleção explícita para este ensaio, somente se necessárias e com regressões. Não mudar defaults dos consumidores existentes.

**Interfaces:**
- Consome `prepararRascunho({expected_context,expected_revision,expected_version_id,provider,model,credential_id})` e `salvarRascunho` existentes.
- Produz DTO de leitura autenticada com seleção preparada, catálogo ativo e credenciais apenas id/provider/label (sem ciphertext), prova atual ou null.
- `iniciarEnsaio({expected_context,expected_revision,expected_version_id,sample_message})`: só IDs/revisão e mensagem chegam do browser. Prompt e modelo saem do snapshot validado pelo banco.
- `revisarEnsaio({expected_context,expected_revision,expected_version_id,run_id})`: servidor exige resultado concluído, não vazio, real e igual ao snapshot atual. Retorna confirmação sem ativar.
- Persistir a última execução e revisão no rascunho existente, com schema central e CAS. Pode usar colunas JSON tipadas pelo contrato; não duplicar dados de organização/credenciais. Uma nova execução substitui a prova corrente e retira a revisão anterior. Execução interrompida deve poder ser refeita sem liberar prova falsa.

- [x] **1. RED: proteção de snapshot e efeitos.** Testar banco real: preparação válida; executar início; editar configuração/versão/negócio; conclusão/revisão recusadas. Outra organização, membro revogado, viewer, organização concluída e ausência de resposta recusadas. Repetição idempotente de revisão gera um audit. Mutação real que deve quebrar: remover comparação do snapshot permite revisar resposta antiga.

```ts
expect(await revisar({ ...ctx, run_id: run.id })).toMatchObject({ ok: false });
// A resposta foi concluída, mas o nome/modelo/prompt mudou desde o início.
expect(await atendimentoAtivo(ctx.orgId)).toBe(false);
```

- [x] **2. Implementar transações curtas.** Locks na mesma ordem da 0222 (org, membership, draft, agent, version); service-only invoker com revoke PUBLIC/anon/authenticated. Início retorna snapshot capturado e identificador servidor. Finalização só aceita run corrente e snapshot ainda válido. Revisão não aceita resposta enviada pelo cliente. Não segurar transação durante rede.

```ts
const inicio = await admin.rpc("fn_iniciar_ensaio_onboarding", trustedInput);
// Só após validar o retorno Zod: usar snapshot retornado, não SELECT posterior.
const resposta = await executarEnsaio(inicio.data.snapshot, mensagem);
// Persistir resultado com compare-and-set; corrida nunca vira aprovação.
```

- [x] **3. RED/GREEN do executor.** Usar `getRequestPool`, `llmEdgeConfigFromEnv` e `runModelCall` (pool já é usado no Next em draft-reply). Chamada sem tools e sem contatos/canais/eventos. Modelo/provider/credencial devem ser exatamente os selecionados; nenhum binding pode substituí-los silenciosamente. Uso/custo registrado pela camada canônica. Reutilizar orçamento; não criar bypass. Erro normalizado sem segredo; resposta truncada por limite do provedor não é sucesso. Testes usam provider falso na fronteira SDK, não chave real.

```ts
expect(chamada.tools).toBeUndefined();
expect(chamada.model).toBe("modelo-escolhido");
expect(chamada.llmOverride).toEqual({ provider: "openai", credentialId: null });
expect(resultadoVazio.ok).toBe(false);
```

- [x] **4. RED/GREEN da UI.** Seleção de modelo começa sem escolha automática; preparar só depois de salvar. Mostrar “Ensaio de conversa, sem envio” e aviso de custo. Mensagem sintética digitável, botão testar, resultado legível e botão revisar separado. Editar qualquer campo/configuração remove resultado revisável local e servidor. Refresh retoma escolha/prova válida. Erro mantém mensagem e configuração. Não chamar createDefaultAgent no novo caminho. “Continuar depois” usa exploração existente. Alterações não salvas bloqueiam teste/revisão.

```tsx
expect(screen.getByRole("button", { name: "Revisar resposta" })).toBeDisabled();
// Após resposta válida do servidor, habilitar; alterar modelo volta a bloquear.
```

- [x] **5. Prova integrada e documentação.** `pnpm gov:verify`, `pnpm test:db`, `pnpm e2e:build`, `pnpm test:e2e tests/e2e/troca-de-organizacao-tem-volta.spec.ts`, sequenciais. Provar localmente erro honesto sem chave, seleção persistida, duas abas/organizações, desktop e 390px sem overflow. Provar sucesso de IA com provider HTTP sintético local se necessário, nunca chamar API real. Relatar separadamente teste de integração e chamada real não realizada.
- [x] **6. Revisão independente.** Entregar diff e evidências para revisão; corrigir falhas antes de declarar concluído. Sem commit/publicação. Não declarar que o wizard completo ou Meta/WAHA estão validados por este ensaio.

## Ambiente local já disponível

Node/pnpm: `PATH="/Users/juansanches/.npm/_npx/2e6a4a8ac0b42ddf/node_modules/.bin:$PATH"`.
Docker: `/opt/homebrew/bin/docker`; adicionar `/opt/homebrew/bin` ao PATH para banco.
Supabase CLI: `/Users/juansanches/.npm/_npx/98af39c2e6cc769d/node_modules/supabase/bin/supabase`.
Projeto local parado com volumes preservados: `/tmp/zapfloo-onboarding-e2e.KooVaP`, nome `zapfloo-onboarding-e2e`. Consultar `--help` antes de comandos CLI. Startup/keys em log privado de `/tmp`, nunca imprimir. E2E usa configuração sintética do harness, não abrir `.env.e2e`. Não parar Docker/Colima globalmente.
