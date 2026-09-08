# Rascunho sem canal — contrato de banco Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permitir persistir versão draft sem conexão, mantendo impossível publicar essa versão sem canal.

**Architecture:** Migração aditiva altera somente a nulabilidade do canal e acrescenta CHECK de coerência com status. Nenhuma organização, versão existente ou autorização é reescrita. Este é o primeiro subprojeto de persistência; a criação administrativa do novo rascunho e sua revisão vêm depois, não estão implicitamente ativadas por esta migração.

**Tech Stack:** Postgres 15 como piso, Supabase CLI, tipos TypeScript gerados, Vitest com Postgres efêmero.

**Spec:** `docs/superpowers/specs/2026-09-08-primeiro-acesso-roxo.md`; evidências em `docs/superpowers/reports/2026-09-08-ensaio-sem-canal-dependencias.md`.

## Global Constraints

- Somente banco local/efêmero, sem Supabase remoto ou publicação.
- Migration nova via CLI, baseline append-only idempotente e MANIFEST juntos.
- Não alterar funções de publicação, RLS, credenciais, modelos ou permissões existentes.
- Canal continua obrigatório para versões published/superseded; draft pode ser arquivado sem canal.
- Não abrir `.env*`; geração e testes usam apenas o ambiente sintético já preparado.

### Task 1: Invariantes e migração

**Files:** criar `tests/invariants/rascunho-sem-canal.test.ts`; criar migration `0220_rascunho_sem_canal` com timestamp da CLI; apender `supabase/baseline.sql`; registrar `supabase/migrations/MANIFEST.md`.

**Interfaces:** `ai_agent_versions.channel_session_id: uuid | null`; CHECK `ai_agent_versions_canal_ao_publicar`.

- [x] Escrever invariantes com duas organizações sintéticas e agentes inativos: INSERT draft sem canal; UPDATE published/superseded sem canal recusado; archive permitido; published com canal preservado; usuário B não enxerga versão A sob RLS.

```ts
await expect(pool.query("update ai_agent_versions set status='published' where id=$1", [versionId]))
  .rejects.toMatchObject({ code: "23514" });
```

- [x] Rodar `pnpm test:db tests/invariants/rascunho-sem-canal.test.ts` e observar falha NOT NULL antes da implementação.
- [x] Criar migration via `supabase migration new 0220_rascunho_sem_canal` e aplicar o SQL abaixo ao arquivo novo e ao fim do baseline:

```sql
alter table public.ai_agent_versions alter column channel_session_id drop not null;
do $$ begin
  if not exists (select 1 from pg_constraint
    where conrelid = 'public.ai_agent_versions'::regclass
      and conname = 'ai_agent_versions_canal_ao_publicar') then
    alter table public.ai_agent_versions
      add constraint ai_agent_versions_canal_ao_publicar
      check (channel_session_id is not null or status in ('draft', 'archived'));
  end if;
end $$;
```

- [x] Rodar novamente o invariante no harness (baseline install + update). Exigir ambas as passadas idempotentes e assertions verdes.

### Task 2: Tipos e compatibilidade

**Files:** gerar `lib/database.types.ts` a partir do Supabase local fiel ao baseline; ajustar somente consumidores que o compilador apontar por canal nullable, preservando guards de publicação.

**Interfaces:** tipos Row/Insert/Update da tabela passam a representar null; runtime de ensaio recebe null sem inventar canal.

- [x] Aplicar apenas a migration nova ao projeto LOCAL `zapfloo-onboarding-e2e`, não usar `--linked` ou project-id remoto.
- [x] Gerar com CLI `gen types --local --schema graphql_public,public,storage --workdir /tmp/zapfloo-onboarding-e2e.KooVaP`; revisar diff gerado antes de aceitar. Saída em `/tmp/zapfloo-database-types-0220.ts`. Apenas o bloco `ai_agent_versions` foi transplantado automaticamente do resultado gerado: a versão local de Storage diverge da fonte original e não pertence à migração. Nenhum campo foi digitado manualmente nos tipos.
- [x] Rodar typecheck; consumidores compilam com a nulabilidade. Duas interfaces locais de versão passaram a representar null, sem criar canal fictício ou modificar transporte.
- [x] Rodar unitários e banco completo, registrar gates e revisão independente. Banco: 158 arquivos/1.250 passes/1 skip; `gov:verify`: 704 arquivos/7.570 passes, saída 0; build local verde. Revisão independente do SQL e da recuperação após colisão sem bloqueadores novos. Não invertida ainda a ordem da UI.

## Limites deste plano

Não entrega sozinho o assistente novo: falta action transacional de rascunho, revisão ligada à versão, UI do ensaio e autorização explícita de contato. Os endpoints atuais mantêm sua validação de canal até os consumidores do novo fluxo estarem prontos.
