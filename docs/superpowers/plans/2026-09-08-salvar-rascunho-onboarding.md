# Salvar e retomar o rascunho — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkboxes. Execução manual: banco, action e formulário compartilham o mesmo contrato; revisão independente ao final.

**Goal:** Salvar nome, jeito de falar e regras antes de criar/publicar um agente, retomando os campos e recusando sobrescrita por uma aba antiga.

**Architecture:** `onboarding_drafts` guarda somente a intenção editável, uma linha por organização e revisão monotônica. Não duplica versão executável nem armazena credencial. Uma RPC invoker exclusiva do servidor valida admin/organização e faz compare-and-swap sob lock; o formulário existente ganha salvamento explícito e retoma esse conteúdo. `ai_agents`, versões, memória compartilhada e canais não são escritos ao salvar.

**Tech Stack:** Postgres 15, Supabase, Zod, Next.js 16, Vitest e Playwright.

**Spec:** `docs/superpowers/specs/2026-09-08-primeiro-acesso-roxo.md`, recorte de persistência/retomada. Ensaio e publicação não são entregues por este subplano.

## Global Constraints

- Sem deploy, VPS, Supabase remoto, mensagens reais, chaves de produção, commit ou push.
- Preservar limites existentes: nome 2–80, três identificadores PROMPT_TEMPLATES, regras até 20.000 caracteres.
- Rascunho é configuração preparatória, não `ai_agent_version`: não exige chave/modelo e não escolhe outro modelo silenciosamente.
- Contexto de usuário/organização vem de `requireOnboardingCtx`; nunca aceitar esses IDs do browser.
- Ajuste da revisão independente: carregar um fingerprint de usuário/organização com o formulário, mantê-lo junto dos campos e compará-lo com o contexto autorizado antes de salvar. É detector de aba antiga, não credencial; revisão numérica sozinha não protege contra troca de organização em outra aba.
- Uma organização já concluída ou suspensa não pode ser modificada por esta RPC.
- Não mudar ordem do wizard nem remover a criação legada neste lote. A nova jornada só substitui a antiga depois de provar ensaio/revisão/autorização.
- PT/ES, marca canônica e erros sem segredos. Preserve alterações anteriores do worktree.

## Task 1: Persistência atômica

**Files:** nova migration 0221 via CLI, baseline apêndice, MANIFEST; `tests/invariants/onboarding-draft-save.test.ts`.

**Interface:** `fn_save_onboarding_draft(p_org_id uuid, p_actor_id uuid, p_expected_revision integer, p_configuration jsonb) returns jsonb` com `{revision, configuration}`. `onboarding_drafts` tem organization_id PK/FK, revision, configuration, updated_by FK e updated_at.

- [x] Testar primeiro: salva sem agente/canal; repete mesmo payload sem duplicar; duas abas com revisão 1 e valores diferentes resultam em uma gravação e um conflito; ator externo/viewer/revogado recusado; RLS admin só vê sua org; anon/authenticated não executam RPC nem escrevem tabela; org concluída/suspensa recusada; tamanho inválido não altera linha; audit contém revisão sem conteúdo.

```ts
const outcomes = await Promise.allSettled([save(1, "Nome A"), save(1, "Nome B")]);
expect(outcomes.filter(x => x.status === "fulfilled")).toHaveLength(1);
expect((await read()).revision).toBe(2);
```

- [x] Observar vermelho por função ausente; criar SQL idempotente via CLI. Lock da organização com `FOR UPDATE`; conferir membership admin aceita/não revogada. Comparar revisão antes do UPDATE. Payload igual ao atual pode retornar a mesma revisão apenas se revisão esperada não for futura; nunca restaurar payload antigo.

```sql
select * into org from public.organizations where id=p_org_id for update;
-- Depois dos guards: lê rascunho, compara revisão, INSERT/UPDATE e audit na mesma transação.
-- GRANT SELECT a authenticated com policy admin/tenant; revogar todos os demais grants.
-- RPC: security invoker set search_path=''; EXECUTE somente service_role.
```

- [x] Rodar banco targeted em install/update. Nenhum backfill: tabela nova.

## Task 2: Action e formulário

**Files:** `lib/onboarding/rascunho.ts`, `app/actions/onboarding/rascunho.ts`, `app/onboarding/setup-ai/{page.tsx,_form.tsx}`, `lib/i18n/dicionario.ts`, testes unitários de action/formulário; tipos gerados via Supabase local.

**Interface:** schema `rascunhoInputSchema` = revisão esperada + configuração validada; `salvarRascunho(input: unknown)` retorna `{ok:true, revision}` ou `{ok:false,error}`; `lerRascunho()` resolve contexto autorizado e retorna draft/null. Erros de leitura não viram formulário vazio silencioso.

- [x] RED action: autorização antes do banco, inválido sem RPC, conflito não vira sucesso, erro inesperado não expõe mensagem do banco; chamada real da action contra boundary falso mínimo.
- [x] Implementar somente leitura filtrada e RPC com IDs do contexto. Sem chamadas a criação/publicação/modelos/IA.
- [x] RED formulário: conteúdo inicial reaparece, botão salvar não chama criação, conflito preserva campos locais e orienta recarregar, controles desabilitados durante operação, sucesso informa que nada foi ativado.
- [x] Implementar botão explícito de rascunho no formulário existente, status acessível e conteúdo inicial do server. Carregamento falho bloqueia gravação até recarregar, sem apagar dados.

```tsx
<Button type="button" disabled={pending || falhaAoCarregar} onClick={salvar}>
  {t("Salvar rascunho")}
</Button>
```

## Task 3: Prova e documentação

**Files:** spec E2E existente de onboarding, mapa de jornadas, mapa específico `onboarding-rascunho.architecture.json` (não havia mapa do salvamento), fragmento `.changes`, relatório do lote.

- [x] E2E pelo browser com Supabase local: admin preenche, salva, recarrega, recebe os mesmos campos; zero diferença em agentes/versões/canais e estado de ativação. Capturar desktop/celular e medir overflow.
- [x] Typecheck/lint/unitários, banco completo, build e E2E com saída real; revisão independente do delta.
- [x] Registrar entrada formulário → action/RPC → leitura/formulário; atividade audit → tela canônica de auditoria; conflito → recarregar sem sobrescrever; falta de IA não impede guardar configuração. Este lote não é conclusão do fluxo de ativação.
