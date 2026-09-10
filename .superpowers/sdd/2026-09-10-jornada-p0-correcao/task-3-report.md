# Task 3 — E2E versionado e jornada fresca executável

## Status

Implementação concluída no commit `95e7e733f` (`test(onboarding): versionar jornada fresca P0`).

A prova fresca real **não foi executada** por esta task. Nenhum QR real foi gerado. O root reservou o perfil real, o aparelho autorizado e o scan assistido; portanto este relatório não declara pareamento nem jornada VPS fresca aprovados.

## Escopo entregue

- `tests/e2e/vps-fresh-onboarding.spec.ts`
  - uma única jornada, no mesmo teste/contexto que gera o QR e observa o autoavanço;
  - zero seed/reset/delete e banco somente leitura;
  - preflight com opt-in, dono fictício, exatamente um usuário, exatamente uma organização global, organização resolvida por `created_by`, vínculo admin, estado inicial vazio, zero canal/agente/versão/credencial/rascunho/MFA;
  - ausência das chaves opcionais de IA/Resend no runner por asserções booleanas;
  - ausência de chave do provedor selecionado e de e-mail no processo Next por `/api/v1/system/instalacao`, sem `?provar=1`;
  - ordem real welcome → conexão QR real → IA adiada → funil → convite → done;
  - medições com `getBoundingClientRect`, `getComputedStyle`, overflow e QR carregado (`naturalWidth`/`naturalHeight`) em 1440/768/390 antes de liberar o scan;
  - screenshots persistidos sempre mascaram QR/telefone/TOTP/recovery/link; o QR escaneável usa um único PNG transitório em diretório privado criado por `mkdtemp` (`0700`, arquivo `0600`), atualizado quando o código gira, reemite `QR_PRONTO` e é removido no `finally`;
  - fallback de convite sem Resend comprova um único link, mantido só em memória;
  - MFA opcional comprova QR, dez códigos de recuperação mascarados e fator verificado, mantendo o secret TOTP só em memória;
  - novo contexto sem `onboarding_explore` passa pelo desafio MFA, entra no Inbox e não reabre o onboarding.
- `tests/e2e/onboarding-sem-ia.spec.ts`
  - fixture própria por UUID e cleanup somente de seus recursos;
  - POST e GET de sessão recusados explicitamente com 503, erro visível e zero QR;
  - IA adiada sem agente/versão/credencial/canal/onboarded, com auditoria `onboarding.ai_skipped`;
  - exatamente um controle Explorar abre Inbox sem concluir;
  - novo contexto prova ausência do cookie de exploração antes e depois do login e volta à conexão pendente;
  - mesmas asserções booleanas de ausência de chaves no runner e retrato autenticado do processo Next.
- Specs afetadas pela ordem
  - `wizard-do-funcionario`: removeu ações legadas de pular WhatsApp, criação/publicação automática e `/onboarding/testar`; preservou identidade, escolha de canal, funil, atividade e o controle real acionável `Configurar chave de IA` com ida a Credenciais e retorno ao setup.
  - `troca-de-organizacao-tem-volta`: segue a ordem conexão → link opcional IA; preserva rascunho, conflito entre abas, troca/volta, exploração e MFA.
  - `onboarding-ativacao-restrita`: segue a ordem nova, preserva recuperação/revisão/ativação; a sessão WORKING sintética nasce antes do SSR e não usa confirmação real do transporte como refresh.
  - Screenshots dessas specs agora usam `test.info().outputPath(...)`; não sobrescrevem os PNGs históricos versionados.
- Gate e configuração
  - `playwright.fresh.config.ts` exige `FRESH_E2E_OPT_IN=1`, URLs HTTP com hostname local validado por `URL`, credenciais explícitas e e-mail `.test`; coleta somente `vps-fresh-onboarding`, sem `webServer`, `globalSetup`, seed/reset ou artefatos automáticos sensíveis; timeout total de 16 minutos deixa 10 minutos exclusivos ao scan.
  - `vitest.config.ts` ancora apenas as suítes `tests/{e2e,invariants,journeys}` da raiz e exclui `.superpowers/**`/worktrees.
  - `escopo-dos-gates.test.ts` comprova coleta de fonte própria aninhada, exclusão de terceiros/evidências, fail-closed antes de interpretar URL e rejeição de `localhost.attacker.test`.
  - Workflow inclui `onboarding-sem-ia` no CI e deixa `vps-fresh` fora pelo motivo exato: WAHA/Redis reais + scan manual de aparelho autorizado. O agregador falha para exclusão sem motivo conhecido.
- Ajuste adicional autorizado pelo root
  - somente a prosa em `app/actions/onboarding/skipWhatsapp.ts`: `transporte já responde WORKING`, para satisfazer `lint:channels`; nenhum comportamento/allowlist foi alterado.

## Testes e provas

### Rodadas E2E coordenadas pelo root

- Normal R3: `exit 0`, **12 passed**, **2 skipped** (casos sintéticos guardados), 52,4 s. Log: `/tmp/zapfloo-p0-e2e-normal-r3.log`.
- Sintética R2 focada em ativação: `exit 0`, **3 passed**, 1,0 min; recuperação 14,3 s, pt-BR 17,5 s, es 19,4 s. Log: `/tmp/zapfloo-p0-e2e-synthetic-r2.log`.
- Na rodada sintética anterior, troca-de-organização passou 4/4; os dois únicos vermelhos eram o canal inserido depois do SSR. A fixture foi movida para antes da navegação e a R2 acima ficou verde. Log diagnóstico: `/tmp/zapfloo-p0-e2e-synthetic.log`.

### Verificação consolidada coordenada pelo root

- `pnpm gov:verify`: `exit 0`; typecheck e lints verdes, 0 erros, 310 warnings preexistentes; **753 arquivos / 7909 testes passed**; fase unitária 308,18 s. Log: `/tmp/zapfloo-p0-gov-final-r2.log`.

### Verificação final no diff desta task

- `pnpm typecheck`: `exit 0`.
- ESLint focado nos 10 arquivos próprios: `exit 0`.
- `pnpm lint:channels`: `exit 0` — `lint-channels: ok (62 arquivos de dívida conhecida, nenhum novo)`.
- `pnpm exec vitest run tests/unit/escopo-dos-gates.test.ts tests/unit/e2e-cobertura-completa.test.ts tests/unit/e2e-nao-escolhe-a-primeira-linha.test.ts --reporter=verbose`: `exit 0`; **3 arquivos / 13 testes passed**.
- `pnpm exec playwright test --config=playwright.fresh.config.ts --list` com valores locais fictícios: `exit 0`; **1 teste em 1 arquivo**, somente `vps-fresh-onboarding.spec.ts`.
- `git diff --check`: `exit 0`.

## TDD e sabotagens restauradas

1. Coleta Vitest RED: com a exclusão ampla `**/tests/e2e/**`, a fonte própria `pacote/tests/e2e/proprio.spec.ts` não era coletada; uma fixture sob `.superpowers/evidence` também aparecia indevidamente. Após ancoragem/exclusão explícita, o gate ficou verde.
2. Host local RED: a validação foi sabotada temporariamente para `startsWith("localhost")`; `localhost.attacker.test` passou e o teste falhou porque o status foi 0. A comparação por hostname exato foi restaurada e o gate ficou verde.
3. Cobertura do workflow RED: `onboarding-sem-ia.spec.ts` foi removida temporariamente de `SPECS_PARTE_2`; o gate acusou a spec ausente. A entrada foi restaurada e o gate ficou verde.

Todas as sabotagens foram restauradas antes do commit.

## O que deliberadamente não foi executado

- `vps-fresh-onboarding.spec.ts` contra o perfil real;
- geração/scan de QR WAHA;
- envio de mensagem por WhatsApp;
- qualquer seed/reset/start/build do perfil real por esta task.

Esses itens permanecem sob coordenação do root. Escrever a spec, listá-la e passar gates estáticos não substitui a prova fresca.

## Concerns / próximos passos

- Bloqueio restante de evidência: executar a fresh no perfil isolado real com WAHA/Redis e scan do aparelho autorizado. Até isso ocorrer, o comportamento positivo de pareamento, as medições com QR real, o fallback de convite e MFA/reentrada da mesma instalação permanecem **não comprovados em runtime fresco**.
- O QR transitório é sobrescrito quando a imagem gira e removido inclusive em timeout; o operador deve acompanhar o último marcador `QR_PRONTO` enquanto o teste está vivo.
- Os artefatos automáticos da configuração fresh ficam desligados. Só screenshots explicitamente mascarados vão ao output temporário; o PNG escaneável nunca usa diretório versionável.

## Fix round 1/5 — proteção do artefato e cleanup

Implementação: commits `9f43b79e2` (`test(onboarding): proteger artefatos da prova fresca`) e `a47a69823` (`test(onboarding): evitar snapshots em fases sensiveis`).

### Achados corrigidos

- O QR escaneável agora nasce dentro de `mkdtemp` exclusivo, com diretório `0700` e placeholder `0600`. A criação possui cleanup interno em erro, e o lifecycle externo começa antes da criação/primeira captura; remove o diretório inteiro em avanço, timeout ou qualquer erro.
- O cleanup de `onboarding-sem-ia` passou a validar os resultados de delete da organização e do usuário. O agregador tenta todas as operações mesmo quando uma falha, lança erro apenas com a contagem e nunca repete o detalhe potencialmente sensível.
- Retry TOTP limitado a três tentativas foi restaurado somente no enroll/login fresco, aguardando a próxima janela quando necessário; a suíte continua com `retries: 0`.
- A config fresh ativa `PLAYWRIGHT_NO_COPY_PROMPT=1`. Em Playwright 1.62.1 isso impede `page.ariaSnapshot()` automático; `error-context.md` ainda pode existir com erro/source, mas sem snapshot DOM.
- O novo gate executa o corpo real de `_takePageSnapshot` da versão instalada com marcador gerado em runtime. O controle sabotado comprova captura/vazamento sem o guard; o caminho protegido comprova ausência do marcador no `buildErrorContext`. Todas as asserções sobre o marcador são booleanas.
- Durante link de convite, secret TOTP e recovery codes no DOM, a fresh não usa matchers de Locator: espera/conta por sondas booleanas. Isso também evita o `error.errorContext` próprio de matchers, que não passa pelo guard do snapshot automático.

### RED

Comando:

```bash
pnpm exec vitest run \
  tests/unit/escopo-dos-gates.test.ts \
  tests/unit/e2e-prova-fresca-seguranca.test.ts \
  --reporter=verbose
```

Resultado: `exit 1`; 2 arquivos falharam. O gate de config recebeu `undefined` em vez de `"1"`, e a nova suíte não encontrou `tests/e2e/utils/seguranca-da-prova-fresca`. Falhas coerentes com as proteções ainda ausentes.

### GREEN e sabotagem integrada

- Mesmo comando após implementação: `exit 0`; **2 arquivos / 7 testes passed**.
- Matriz final com `escopo-dos-gates`, `e2e-prova-fresca-seguranca`, `e2e-cobertura-completa` e `e2e-nao-escolhe-a-primeira-linha`: `exit 0`; **4 arquivos / 16 testes passed**.
- Controle sabotado integrado: o método real, executado sem `PLAYWRIGHT_NO_COPY_PROMPT`, captura o marcador runtime e o `buildErrorContext` o contém; com o guard, ambos os booleanos de vazamento ficam falsos. O valor nunca aparece em source/assert/output.
- `pnpm typecheck`: a primeira execução acusou a diferença correta entre `Promise` e o `PromiseLike` do PostgREST; após tipar o helper pela interface awaitable real, `exit 0`.
- ESLint focado nos seis arquivos: `exit 0`.
- Fresh `--list` com ambiente local fictício: `exit 0`; **1 teste em 1 arquivo**.
- `git diff --check`: `exit 0`.

### Provas runtime coordenadas pelo root

- Sonda Chromium real do guard: `exit 0`. Sem o guard, a falha deliberada terminou em `exit 1`, criou um `error-context.md` e capturou o marcador fictício gerado em runtime; com o guard, também terminou em `exit 1` e criou um `error-context.md`, mas o marcador ficou ausente. A sonda não usou banco, app nem credencial real e registrou somente booleanos. Fonte local não versionada: `.superpowers/fresh-p0-correcao/provar-dom.mjs`; log: `/tmp/zapfloo-p0-dom-real.log`.
- Negativa B após o hardening do cleanup: `exit 0`; **1 passed**, 36,8 s (caso 25,5 s). Log: `/tmp/zapfloo-p0-e2e-negative-fix1.log`.

### Não executado nesta rodada

- A fresh real continuou intocada; nenhum login/QR foi consumido.
- A prova positiva fresh ainda não foi executada; o perfil A continuou sem login/QR durante esta rodada de correção.

## Fix round 2/5 — coluna válida no preflight fresco

### Causa raiz e correção

- A primeira execução fresh terminou em 2,5 s, antes de login/QR, com erro sem mensagem no preflight. A sonda read-only do root isolou a quinta contagem: `onboarding_drafts` respondia `400` ao `HEAD select=id`, enquanto auth, organização, quatro tabelas anteriores e MFA respondiam `200`.
- `onboarding_drafts` tem `organization_id` como chave primária e não possui `id` (`supabase/migrations/20260908175114_0221_onboarding_draft_save.sql:3-8`; `lib/database.types.ts:5635-5648`). As outras quatro tabelas da iteração também possuem `organization_id`.
- A única consulta foi corrigida para `select("organization_id", { count: "exact", head: true })`, preservando o filtro explícito por organização e a asserção de contagem zero. O client da spec passou a carregar `Database` para manter a consulta ligada aos tipos gerados.
- Se uma dessas leituras falhar novamente, a exceção informa somente tabela e status HTTP; não repete mensagem, detalhe ou hint retornado pelo banco.

### RED / GREEN / sabotagem restaurada

- RED focado com a spec ainda em `select("id")`: `pnpm exec vitest run tests/unit/e2e-preflight-fresco.test.ts --reporter=verbose` terminou em `exit 1`; recebeu `id` quando o contrato exigia `organization_id`.
- O gate novo usa a AST TypeScript da consulta real e das `Row` em `lib/database.types.ts`; comprova que a mesma coluna selecionada existe nas cinco tabelas. Não depende de regex nem acessa banco.
- GREEN após a troca: mesmo comando em `exit 0`; **1 arquivo / 1 teste passed**. O estado com `id` foi a sabotagem observada e foi restaurado para `organization_id` antes do commit.
- `pnpm typecheck`: `exit 0` após corrigir um narrowing no próprio gate.
- ESLint focado na spec e no gate: `exit 0`.
- `git diff --check`: `exit 0`.

### Prova real read-only coordenada pelo root

- Sonda contra o perfil A com a coluna corrigida: `exit 0`; todas as cinco consultas `HEAD select=organization_id` responderam `200` com `count=0`, inclusive `onboarding_drafts`. Também confirmou estado `{}`, `onboarded=false`, um dono, uma organização e zero MFA. Log: `/tmp/zapfloo-p0-fresh-preflight-coluna.log`.
- A sonda não alterou banco e a jornada continuou antes de welcome/login/QR, portanto o perfil fresco permaneceu apto à reexecução positiva.
- `gov:verify` R3 do root terminou em `exit 0`, com **754 arquivos / 7912 testes**, typecheck/lints sem erros e 310 warnings preexistentes. Como a coleta começou antes da criação do gate desta rodada, esse resultado não é atribuído ao novo teste; a evidência dele é o RED/GREEN focado acima.
