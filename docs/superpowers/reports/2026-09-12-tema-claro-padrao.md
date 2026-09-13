# Tema claro no primeiro acesso — 12/09/2026

Branch `codex/tema-claro-padrao`, criada de `origin/main` em `5cd59cb14`.

## Contrato

Sem preferência salva, o script inline e o `ThemeProvider` resolvem para claro.
Valores explícitos `light`, `dark` e `system` continuam preservados. Apenas
`system` acompanha o sistema operacional. Nenhuma leitura grava uma escolha
no armazenamento. Os arquivos da sidebar, dos tokens e do seletor não mudaram;
o provedor corrige também a sincronização do seletor após hidratar. Sem schema.

O script permanece síncrono no `<head>`, antes do conteúdo. Os testes de
navegação e redesign que mediam escuro via sistema agora escolhem `system`
explicitamente e conferem o atributo, mantendo a cobertura real do tema escuro.

Uma premissa foi corrigida na prova, não no produto: o fundo da sidebar já usa
dois tons escuros, via `--color-shell` (`app/globals.css:260/342`). A nova
asserção de igualdade de RGB reprovou indevidamente. A prova passou a medir
fundo escuro e contraste do texto claro nos dois temas. CSS, cores da marca
e sidebar foram preservados, inclusive essa pequena diferença preexistente.

## Reprodução e sabotagem

- Antes da correção: `tema-padrao.test.tsx`, **5 falhas / 12 aprovados**;
  os casos acusam o padrão antigo no script, no cliente e no servidor.
- A correção inicial passou os 17 testes. No navegador, porém, **7 passaram e
  1 reprovou**: após reload, DOM, armazenamento e fundo estavam escuros, mas o
  botão conservava `Tema: light` e o ícone renderizado pelo servidor. Diagnóstico
  em `.superpowers/evidence/tema-padrao/diagnostico-reload.json`.
- Um teste adicional com `hydrateRoot` e o `ThemeToggle` real reproduziu esse
  defeito: **1 falha / 17 aprovados**. O provedor agora usa o marcador de
  hidratação já empregado em `CampoDeLogo`, mantém o primeiro render compatível
  com o servidor e só depois expõe a preferência salva aos consumidores.
- Sabotagem: retirar `if (!hydrated) return` do efeito reprovou o teste de
  hidratação (**1 falha / 17 aprovados**), porque escreveu `light` sobre o `dark`
  do script antes de voltar a `dark`. Restaurada a guarda: **18 aprovados**,
  exit 0. Nenhuma exceção de hidratação foi suprimida no produto.

Logs locais: `/private/tmp/tema-red.log`, `tema-hidratacao-red.log`,
`tema-sabotagem-guarda.log` e `tema-unit-restaurado.log` (mesmo diretório).

## Verificação final

- Node 22 e `corepack pnpm`, no worktree isolado desta branch.
- Lint completo: exit 0, **0 erros / 309 avisos**, nenhum nos arquivos alterados.
- `corepack pnpm typecheck`: exit 0.
- `corepack pnpm lint:channels` e `corepack pnpm lint:role-rank`: exit 0.
- `corepack pnpm test:unit --maxWorkers=4`: exit 0; rodapé **754 arquivos / 7.888
  testes aprovados**, zero registros `FAIL`, duração 589,70 s. Não é apenas
  `tests/unit/`: é o script integral do repositório. A primeira tentativa
  restrita foi interrompida por bloqueio dos servidores HTTP/DNS usados pela
  suíte; esta execução final permitiu as operações locais necessárias.
- `corepack pnpm exec next build --webpack`: exit 0, compilação de produção
  local com `.env.e2e` gerado e validado para Supabase local em `127.0.0.1:57521`.
  Nenhuma chave de IA real foi usada. O teste não exige IA nem envio de mensagens.
- `corepack pnpm release:conferir`: exit 0; fragmento `nada_mudou/alterado`
  reconhecido. Somente conferência, nenhuma versão/release foi escrita.
- Playwright: **8 aprovados, zero skips, exit 0, 1,4 min**. Comando:

```sh
E2E_PORT=3150 corepack pnpm exec playwright test \
  tests/e2e/tema-padrao.spec.ts tests/e2e/navegacao.spec.ts \
  tests/e2e/redesign-operacional.spec.ts \
  --grep 'padrão claro|visão geral usa dados locais reais|o sistema operacional preserva hierarquia' \
  --reporter=list
```

Os seis casos novos cobrem quatro preferências iniciais, JavaScript de
hidratação bloqueado e a sequência real seletor → dark → reload → armazenamento
forçado dark → reload → apagar preferência → light → system → mudar SO → reload.
Os dois casos existentes preservam a cobertura de navegação/tema em desktop,
tablet e 390px. A prova de primeira pintura usa Chromium em 1280×720, contexto
novo, SO em escuro, `MutationObserver`, `requestAnimationFrame`, Paint Timing
e `getComputedStyle`. O banco de testes foi reutilizado; não se afirma aqui
uma instalação fresca completa nem uma nova validação de onboarding.

### Primeira pintura — medições finais

Tempos em ms desde a navegação. A coluna de registro é a **última observação**
antes da primeira pintura, não uma medição de desempenho do produto. Todos os
quadros observados de cada caso tiveram somente o tema e o fundo esperados:
**239 quadros, nenhum com cor divergente**.

| Caso / arquivo JSON | Tema | Registro pré-pintura | Primeira pintura | Quadros |
|---|---|---:|---:|---:|
| `inicio-novo` | light | 66,5 | 88 | 39 |
| `inicio-dark` | dark | 55,7 | 68 | 27 |
| `inicio-light` | light | 60,3 | 72 | 22 |
| `inicio-system` | dark | 44,7 | 60 | 20 |
| `antes-da-hidratacao` (chunks JS bloqueados) | dark | 49,9 | 64 | 14 |
| `escuro-apos-reload` | dark | 5.523,9 | 5.532 | 61 |
| `claro-apos-limpar` | light | 1.860,5 | 1.868 | 19 |
| `sistema-apos-reload` | dark | 1.658,7 | 1.680 | 37 |

Fundo claro medido: `rgb(250, 249, 252)`; escuro: `rgb(17, 17, 20)`.
Na sidebar, o contraste do texto-base branco com o fundo foi **18,52:1** em
claro e **19,78:1** em escuro; isso não é auditoria de todo texto da sidebar.

Evidência local: `.superpowers/evidence/tema-padrao/` (JSON de cada linha e PNG),
mais `sidebar-light.json` e `sidebar-dark.json`. São contas e marca do ambiente
de testes, não a produção. As provas executáveis estão versionadas na spec e
incluídas no CI via `SPECS_PARTE_1`.

Logs finais em `/private/tmp/`: `tema-unit-final.log`, `tema-build-final.log`,
`tema-typecheck-aceite.log`, `tema-lint-aceite.log`, `tema-gates-final.log` e
`tema-e2e-aceite.log`. Revisão independente do provedor e da régua: sem achados
bloqueantes. `git diff --check`: exit 0.

## Living System Checklist

- Entrada: `localStorage` e `prefers-color-scheme`, nos mecanismos existentes.
- Saída/tela: `data-theme` em `<html>`, consumido pelos tokens de `app/globals.css`
  e por `useTheme()`; afeta login e todas as telas sob o layout raiz.
- Configuração/porta: `ThemeToggle` existente no menu do usuário; conserva três
  opções. Nenhuma rota nova.
- Atividade: preferência local do navegador; não é mutação de negócio e não
  gera evento/auditoria no servidor.
- Anti-morte/retorno: claro quando a preferência falta ou não pode ser lida;
  escolha manual substitui o padrão e é reutilizada no próximo carregamento.
- Continuidade IA/humano: não se aplica; nenhuma ação de atendimento alterada.
- Mapa: nenhuma peça arquitetural nova; os consumidores existentes permanecem.

## O que não foi medido

- Publicação/produção, CI remoto, suite E2E inteira e navegadores diferentes do
  Chromium. Não se declara ausência de pisca em plataformas não exercitadas.
- Banco/RLS: não exercitados nesta entrega, que não muda schema, acesso ou dados.
- Os logs do navegador registraram avisos do Supabase sobre `getSession()` e
  `The destination stream closed early`; não houve falha nos oito casos finais.
  A causa desses avisos não foi investigada nesta tarefa de tema.

## Fechamento

| Concluído e testado | Pendente | Bloqueado |
|---|---|---|
| Default claro, preferências preservadas, hidratação sem pisca observado, seletor e sidebar preservados; provas acima na branch `codex/tema-claro-padrao`. | Revisão/merge e publicação são etapas posteriores, fora desta entrega. Nenhum deploy ou PR realizado. | Nenhum impedimento para a alteração local. Limites de medição estão discriminados acima. |

## Revalidação após a main — 13/09/2026

Esta seção atualiza o fechamento histórico acima. `git fetch origin` seguido
de `git merge origin/main` incorporou a main `7c142cc098faa18ed19a7b0718cb38b7f42a3eec`
(inclui os PRs #14 e #15), sem conflitos, no merge `9e616f746`. Não houve
novo ajuste de produto, schema, versão ou deploy neste fechamento.

Com Node 22.23.2 e pnpm 9.15.9 via Corepack, no worktree desta branch:

```sh
corepack pnpm exec vitest run tests/unit/tema-padrao.test.tsx \
  tests/unit/e2e-cobertura-completa.test.ts --reporter=verbose
```

Antes da sabotagem, exit 0, **29 testes aprovados**. O guarda atualizado pelo
#14 passou e `tema-padrao.spec.ts` permanece em `SPECS_PARTE_1` no workflow.

### Sabotagem executada nesta base — saída vermelha

Temporariamente, o script inline voltou a considerar ausência de preferência
como `system`: `(s==='system'||!s)&&d`. O fallback de `readStoredTheme` também
voltou a `system`. Os testes não foram alterados. Comando, exit **1**:

```sh
corepack pnpm exec vitest run tests/unit/tema-padrao.test.tsx --reporter=verbose
```

Trechos literais do log (as quatro falhas):

```text
 FAIL  tests/unit/tema-padrao.test.tsx > tema antes da primeira pintura > preferência null, sistema escuro true → light
AssertionError: expected "vi.fn()" to be called once with arguments: [ 'data-theme', 'light' ]

Received:

  1st vi.fn() call:

  [
    "data-theme",
-   "light",
+   "dark",
  ]

 FAIL  tests/unit/tema-padrao.test.tsx > preferência depois da hidratação > mantém preferência null com sistema escuro true → light
 FAIL  tests/unit/tema-padrao.test.tsx > preferência depois da hidratação > mantém preferência invalido com sistema escuro true → light
AssertionError: expected 'system/dark' to be 'light/light' // Object.is equality

Expected: "light/light"
Received: "system/dark"

 FAIL  tests/unit/tema-padrao.test.tsx > preferência depois da hidratação > mantém preferência null com sistema escuro false → light
AssertionError: expected 'system/light' to be 'light/light' // Object.is equality

Expected: "light/light"
Received: "system/light"

 Test Files  1 failed (1)
      Tests  4 failed | 14 passed (18)
```

Restaurados os dois arquivos exatamente ao conteúdo pós-merge:
`git diff --exit-code -- app/layout.tsx lib/theme.tsx` saiu 0.
O mesmo comando dos dois arquivos unitários saiu novamente 0:

```text
 Test Files  2 passed (2)
      Tests  29 passed (29)
   Duration  2.89s (transform 161ms, setup 366ms, import 1.74s, tests 226ms, environment 1.96s)
```

Logs locais desta rodada em `.superpowers/evidence/tema-padrao/`:
`pos-main-unit-verde.log`, `pos-main-sabotagem-vermelho.log`,
`pos-main-sabotagem.diff` e `pos-main-unit-restaurado.log`.
Esta sabotagem foi executada no Vitest; não se atribui esse vermelho ao E2E.

Durante a revalidação, a main avançou para `3d7ce9898` (merge do PR #16,
release 1.19.0). Esse avanço altera apenas o `CHANGELOG.md` e consome cinco
fragmentos de mudanças. A base testada aqui continua explicitamente a main
`7c142cc09` incorporada no merge `9e616f746`; não se afirma que esse novo merge
da release já foi integrado à branch. O diff próprio do PR
(`origin/main...HEAD`) não modifica versão, CHANGELOG, sidebar ou tokens.

### Build e navegador após restaurar

`corepack pnpm e2e:build`: **exit 0**. Compilação Turbopack em 2,2 min,
TypeScript em 38,9 s e 47 páginas estáticas geradas. O controle do bundle
confirmou `127.0.0.1:57521`, o Supabase local de QA, e não produção.
Log: `.superpowers/evidence/tema-padrao/pos-main-build.log`.

Comando E2E executado (Node 22 no PATH, `NODE_OPTIONS=--max-old-space-size=4096`,
`COREPACK_ENABLE_DOWNLOAD_PROMPT=0`; porta padrão 3001):

```sh
AUTH_RATE_LIMIT_LOGIN_IP=1000 SENTRY_DSN=off \
PLAYWRIGHT_JSON_OUTPUT_FILE=.superpowers/evidence/tema-padrao/pos-main-e2e.json \
corepack pnpm exec playwright test tests/e2e/tema-padrao.spec.ts \
  --workers=1 --reporter=list,json --trace on \
  --output=.superpowers/evidence/tema-padrao/pos-main-artefatos
```

Saída: **exit 0**, `6 passed (13.8s)`. JSON: 6 esperados, 0 inesperados,
0 skips e 0 flaky; `retries: 0` da configuração preservado. Log local:
`.superpowers/evidence/tema-padrao/pos-main-e2e.log`. O servidor de testes
encerrou ao final. Nenhum teste nem código de produto foi alterado para passar.

Medições novas de 13/09, Chromium 1280×720, desde cada navegação. A coluna de
registro mostra a primeira observação do tema, não um benchmark de desempenho.

| Caso / JSON | Tema | Registro antes de pintar (ms) | Primeira pintura (ms) | Quadros |
|---|---|---:|---:|---:|
| `inicio-novo` | light | 47,3 | 104 | 15 |
| `inicio-dark` | dark | 33,4 | 48 | 15 |
| `inicio-light` | light | 18,1 | 44 | 24 |
| `inicio-system` | dark | 31,8 | 48 | 15 |
| `antes-da-hidratacao` | dark | 30,6 | 44 | 6 |
| `escuro-apos-reload` | dark | 1.214,3 | 1.280 | 11 |
| `claro-apos-limpar` | light | 1.069,5 | 1.088 | 15 |
| `sistema-apos-reload` | dark | 625,5 | 652 | 9 |

**110 quadros observados, zero com tema ou cor divergente.** Os JSON/PNG foram
regenerados em `.superpowers/evidence/tema-padrao/`. Contraste do texto-base
da sidebar: 18,522:1 em claro, 19,775:1 em escuro; não é auditoria de todos
os textos da sidebar. Cinco casos normais sem `console.error`; os 20
`ERR_FAILED` do caso que bloqueia os chunks JS são consequência deliberada
do teste de primeira pintura sem hidratação. Traces não foram publicados.

### Fechamento desta revalidação

| Concluído e testado | Pendente | Bloqueado |
|---|---|---|
| Merge sem conflito; 29 unitários verdes; sabotagem com 4 falhas e restauração verde; build e 6 E2Es aprovados, evidência acima. | CI remoto, revisão e eventual merge/publicação. | Nenhum bloqueio local no escopo solicitado. |

**O que não foi medido nesta rodada:** suíte unitária integral, lint integral,
suíte E2E integral, banco/RLS, produção, outros navegadores e viewports. As
medidas mais amplas de 12/09 acima são históricas. A integração com a main
posterior ao merge de trabalho cabe ao CI do PR. Avisos do harness sobre
`next start`/standalone, Sentry desativado com `off`, envs opcionais ausentes e
`getSession()` não foram investigados ou alterados neste fechamento de tema.

A skill `ecc:e2e-testing` orientou a captura de artefatos e a separação entre
prova unitária sabotada e medição real no navegador, sem enfraquecer testes.
