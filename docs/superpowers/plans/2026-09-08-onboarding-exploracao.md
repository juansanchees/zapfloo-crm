# Explorar e retomar o CRM — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permitir sair do onboarding sem concluir a organização ou ativar atendimento.

**Architecture:** Preferência de navegação em cookie de sessão, limitada ao par usuário/organização autenticados. Não é credencial nem autorização: guards de sessão, suspensão, MFA e RBAC continuam valendo. O CRM mostra um link permanente para retomar enquanto a configuração estiver pendente.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-08-primeiro-acesso-roxo.md`, itens boas-vindas, exploração individual e retorno.

## Global Constraints

- Sem deploy, credenciais de produção, mensagens reais, commit ou push.
- Não escrever `onboarded_at`, agentes, canais, termos aceitos ou estado compartilhado ao explorar.
- Português/espanhol; marca canônica; convidados e organizações configuradas preservados.
- Este lote não implementa rascunho, ensaio ou publicação; são dependências separadas descritas na spec.

### Task 1: Preferência individual e action autorizada

**Files:** criar `lib/onboarding/exploracao.ts`, `app/actions/onboarding/explorar.ts`, `tests/unit/onboarding-exploracao.test.ts`.

**Interfaces:** `valorDaExploracao(userId: string, orgId: string): string`, `exploracaoPertenceA(valor: string | undefined, userId: string, orgId: string): boolean`; action `explorarCrm(): Promise<void>` sem IDs fornecidos pelo cliente.

- [x] Escrever teste de action: guard rejeitado não grava cookie; autorizada redireciona ao CRM e cookie só corresponde ao mesmo usuário e organização. Banco privilegiado deve permanecer intocado.

```ts
expect(exploracaoPertenceA(valor, "outro-user", "org-local")).toBe(false);
expect(exploracaoPertenceA(valor, "user-local", "outra-org")).toBe(false);
expect(exploracaoPertenceA(undefined, "user-local", "org-local")).toBe(false);
```

- [x] Rodar `pnpm exec vitest run tests/unit/onboarding-exploracao.test.ts`; observar falha por módulo ausente.
- [x] Implementar hash SHA256 de JSON `[userId, orgId]`; comparação exata e IDs não vazios. Action chama `requireOnboardingCtx()` antes de `cookies().set`, cookie `onboarding_explore` de sessão, HttpOnly, SameSite=Lax, path=/, Secure conforme o protocolo público via cookieSecure(), e `redirect('/app/inbox')`.
- [x] Rodar o mesmo teste até verde sem enfraquecer assertions.

### Task 2: Navegação real e retomada

**Files:** modificar `app/app/layout.tsx`, `app/onboarding/layout.tsx`, `lib/i18n/dicionario.ts`; criar `app/onboarding/_components/ExplorarCrm.tsx`, `components/app/OnboardingPendenteBanner.tsx`; ampliar `tests/e2e/troca-de-organizacao-tem-volta.spec.ts`.

**Interfaces:** componentes sem props: `ExplorarCrm()` chama action, mostra erro seguro e pending; `OnboardingPendenteBanner()` oferece Link `/onboarding`.

- [x] Adicionar ao caso admin existente o clique em “Explorar o CRM”, URL inbox, banner de retomada e leitura local de `onboarded_at` ainda nulo. Clicar em retomar volta ao wizard.
- [x] No layout autenticado, calcular `onboardingPendente` apenas para admin de organização incompleta. Depois da verificação de suspensão, redirecionar apenas quando `!exploracaoPertenceA(cookie, user.id, activeOrg.orgId)`. Banner fica dentro do shell protegido pelo MFA.
- [x] Adicionar botão de exploração aos controles do wizard e traduções espanholas dos novos textos.
- [x] Rodar typecheck/lint, build E2E local e spec de troca, inspecionar screenshots em desktop/celular. Rodar gov:verify completo ao estabilizar o lote.
- [x] Revisar diff: nenhuma gravação compartilhada, autorização não derivada do cookie, nenhuma chamada de envio. Atualizar relatório com resultados reais; não publicar.
