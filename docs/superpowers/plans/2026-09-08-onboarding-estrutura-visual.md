# Onboarding: estrutura visual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Aplicar a primeira camada visual do onboarding aprovado sem alterar publicação, atendimento ou ordem funcional ainda dependente do backend.

**Architecture:** Um componente de apresentação recebe passos canônicos, organização, controles e conteúdo. Lê a marca do provider existente; CSS Module limita os efeitos ao onboarding. Layout e página de boas-vindas deixam de consultar a marca diretamente do ambiente.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Tailwind 4, CSS Modules, Vitest, Playwright; Node 22 e pnpm 9.15.9.

**Spec:** `docs/superpowers/specs/2026-09-08-primeiro-acesso-roxo.md`

## Global Constraints

- Sem deploy, mensagens reais, credenciais de produção, commit ou push.
- Marca configurável tem precedência; não fixar nome ou logo no código.
- Não reordenar etapas nem afirmar que o ensaio sem canal está disponível.
- Esta entrega cobre linguagem visual e resolução da marca. Persistência do novo rascunho, ensaio antes da conexão e exploração individual continuam dependências explícitas do fluxo completo, não funcionalidades entregues neste lote.

### Task 1: Moldura visual e marca resolvida

**Files:** criar `app/onboarding/_components/OnboardingFrame.tsx`, `OnboardingFrame.module.css` e `tests/unit/onboarding-frame.test.tsx`; alterar `app/onboarding/layout.tsx` e `app/onboarding/welcome/page.tsx`.

**Interfaces:** `OnboardingFrame({orgName, passos, controls, children})`, com `passos: PassoVisivel[]` e os dois slots `ReactNode`. Consome `useMarcaDaInstalacao()` e o `Stepper` existente. Não produz estado de negócio nem grava dados.

- [x] Escrever teste de marca e slots antes do componente:
```tsx
render(<OnboardingFrame orgName="Empresa QA" passos={passos} controls={<button>Outra empresa</button>}>
  <input aria-label="Nome do negócio" />
</OnboardingFrame>);
expect(screen.getByRole("img", { name: "Marca QA" })).toHaveAttribute("src", "/qa-logo.svg");
expect(screen.getByLabelText("Nome do negócio")).toBeVisible();
expect(screen.getByRole("button", { name: "Outra empresa" })).toBeVisible();
```
- [x] Rodar `pnpm exec vitest run tests/unit/onboarding-frame.test.tsx --maxWorkers=1`; deve falhar por componente ausente.
- [x] Implementar apresentação sem efeitos ou ações:
```tsx
const marca = useMarcaDaInstalacao();
return <div className={styles.frame}>
  <header>{marca.logoUrl ? <img src={marca.logoUrl} alt={marca.name} /> : <span>{marca.name}</span>}{controls}</header>
  <div className={styles.workspace}><aside><h1>{orgName}</h1><Stepper passos={passos} /></aside><main>{children}</main></div>
</div>;
```
- [x] Aplicar superfícies e bordas por tokens existentes, detalhe roxo/laranja decorativo, grade com `minmax(0, 1fr)` e uma coluna abaixo de 960px; não sobrescrever cores de ações da marca.
- [x] Layout passa os mesmos passos e controles que já fornecia. Boas-vindas usa `NomeDaInstalacao()` (mesmo provider resolvido do cabeçalho), em vez de `branding()`; `marcaDaInstalacao()` sozinho retorna uma linha bruta nullable, não a marca resolvida.
- [x] Reexecutar testes de moldura, passos e marca, typecheck e lint.

### Task 2: Prova de navegador e checkpoint

**Files:** `tests/e2e/troca-de-organizacao-tem-volta.spec.ts`, relatório `docs/superpowers/reports/2026-09-08-onboarding-baseline.md`.

**Interfaces:** fixture local existente, login de administrador com MFA e `data-testid="onboarding-frame"` para ancorar a prova visual.

- [x] No caso admin pendente, capturar desktop e celular antes da saída:
```ts
await expect(page.getByTestId("onboarding-frame")).toBeVisible();
await page.screenshot({ path: "evidence/onboarding/estrutura-desktop.png", fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
await page.screenshot({ path: "evidence/onboarding/estrutura-celular.png", fullPage: true });
```
- [x] Rodar `pnpm e2e:build` e `pnpm test:e2e tests/e2e/troca-de-organizacao-tem-volta.spec.ts` contra o Supabase sintético local, sem chaves de IA.
- [x] Inspecionar as duas imagens; corrigir corte/contraste ou transbordamento antes de declarar esta camada pronta.
- [x] Rodar `pnpm gov:verify`, registrar resultados e limitações; pedir revisão do diff. Sem commit ou publicação.

## Autorrevisão

Este plano é deliberadamente o subprojeto visual, não substitui o plano de persistência/ensaio/ativação do novo fluxo. Os contratos de backend já identificados permanecem documentados na spec. Não há botão novo que prometa uma ação ainda indisponível.
