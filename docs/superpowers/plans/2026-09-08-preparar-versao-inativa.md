# Preparar versão inativa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Etapas acopladas executadas no worktree existente; revisão independente ao final.

**Goal:** Converter uma revisão salva em versão executável inativa, sem publicar, escolher modelo automaticamente, consumir IA ou vincular WhatsApp.

**Architecture:** Server Action autentica admin/MFA, valida contexto e compila o prompt usando o construtor compartilhado com o onboarding existente. RPC transacional confere revisão, contexto do negócio e seleção explícita de IA; cria agente não padrão/inativo e versão draft sem canal. Ponteiro e snapshot em onboarding_drafts tornam repetição idempotente e recusam sobrescrita concorrente.

**Tech Stack:** Next.js 16, TypeScript, Zod, Supabase/Postgres, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-08-primeiro-acesso-roxo.md`; dependências em `docs/superpowers/reports/2026-09-08-ensaio-sem-canal-dependencias.md`.

## Global Constraints

- Somente worktree local; não abrir .env, não deployar, não acessar VPS/banco de produção, não enviar WhatsApp, não commit/push.
- Preservar alterações dos lotes anteriores e caminho legado. Nenhuma escolha automática de provedor/modelo/credencial.
- Preparar não equivale a testar/revisar/ativar. Não gravar aprovação nem alterar onboarding_state, memória compartilhada ou agente existente fora deste rascunho.
- Schema: migration nova pelo CLI + baseline idempotente antes de VARREDURA anon + MANIFEST + tipos gerados.
- Este lote entrega o contrato de preparação no backend. A tela de ensaio e a prova de revisão vinculada ao teste são lotes seguintes; o runtime legado não será ampliado.

## Task 1: Preparação atômica e contrato de servidor

**Files:** `lib/onboarding/prompt.ts`, `lib/onboarding/preparar.ts`, `app/actions/onboarding/prepararRascunho.ts`; extrair somente construtor de prompt de `createDefaultAgent.ts`; migration 0222, baseline, MANIFEST, tipos; testes `onboarding-draft-prepare.test.ts`, `onboarding-preparar-action.test.ts`, `onboarding-prompt.test.ts`.

**Interfaces:**
```ts
// Entrada pública: sem org/ator/prompt/capacidades arbitrários.
type Entrada = {
  expected_context: string; expected_revision: number;
  expected_version_id: string | null;
  provider: string; model: string; credential_id: string | null;
};
// Retorno não declara teste, publicação ou prontidão de credencial.
type Preparado = { revision: number; agent_id: string; version_id: string };
```

- [x] RED: teste real DB exige agente is_active=false/is_default=false, published_version_id=null; versão draft com channel_session_id=null; sem canal/run/evento e sem mudanças em onboarding_state/settings.
- [x] RED: mesma revisão/seleção em paralelo retorna mesmos IDs; seleções diferentes com o mesmo expected_version_id não sobrescrevem a vencedora; revisão antiga e alteração do negócio recusadas.
- [x] RED: admin externo/revogado/concluído/suspenso, modelo inexistente/deprecated e credencial externa/inválida recusados; RPC não executável por anon/authenticated.
- [x] Implementar RPC `fn_prepare_onboarding_draft(uuid,uuid,integer,uuid,jsonb,jsonb)`: locks org → membership → draft → agente → versão; conferir snapshot de versão existente antes de reutilizar/criar; atualizar somente agente próprio inativo; nome ocupado é erro explícito, nunca reuso por nome.
- [x] Snapshot inteiro da versão persistida detecta edição pelo editor. Revisão posterior cria nova versão (não sobrescreve a anterior). Params idênticos retornam IDs existentes sem duplicar audit.
- [x] RED: ação recusa contexto de outra aba/usuário, IDs extras, ausência de modelo e payload incompleto; erro de banco não vaza detalhe; IDs da RPC vêm da sessão.
- [x] Extrair construtor de prompt sem alterar saída legada. Preparação combina prompt com regras apenas na versão, sem publicar memória; exceder 20.000 caracteres falha, nunca trunca silenciosamente.
- [x] Implementar ação e schemas estritos; ler configuração e negócio do banco com filtro confiável; conferir revisão e enviar snapshot do negócio à RPC para fechar TOCTOU.
- [x] Rodar testes direcionados RED/GREEN, baseline install/update e tipos gerados locais.

## Task 2: Verificação e documentação do contrato

- [x] Atualizar mapa arquitetural e jornada, release note e relatório com limites explícitos.
- [x] Rodar gov:verify e test:db completos sequencialmente; build; E2E de regressão do onboarding se a extração afetar o caminho legado.
- [x] Revisão independente de segurança/concorrência; corrigir achados e repetir testes pertinentes.
- [x] Registrar evidências reais e manter o worktree sem publicar. Não apresentar o ensaio com IA como concluído.
