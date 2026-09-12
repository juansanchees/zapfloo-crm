# Contraste da shell — 10/set/2026

Branch `codex/contraste-shell`, base `codex/correcoes-anexos` em `2dfb1bfde`.
Escopo: contraste, sem alterar specs, schema, main, VPS, release ou abrir PR.

## Diagnóstico conferido

O run remoto `34485370251` foi consultado por `gh run view --log-failed` no
repositório **juansanchees/zapfloo-crm**, não no upstream. As ocorrências da
mensagem de contraste se repetem em `message`, `failureSummary` e no diff da
asserção dos mesmos dois testes de RBAC. Não representam dez testes distintos.
Há dois achados nesse log: título `Crescimento` (3,81:1) e versão (2,42:1).

A varredura de `components/shell` encontrou **uma** ocorrência de
`text-white/40`, em `Sidebar.tsx`. `MobileSidebar.tsx` reutiliza esse componente;
não há uma segunda cópia do título para corrigir. O outro arquivo afetado é
`VersionFooter.tsx`: usava `text-muted-foreground` e `text-foreground`, cores
do conteúdo claro sobre um fundo que permanece escuro.

## Mudança mínima

- `Sidebar.tsx`: título `/40` → `/60`.
- `VersionFooter.tsx`: versão instalada → `text-white/60`; aviso → `text-white`.
- Nenhuma cor nova, hex adicional, edição em `globals.css` ou mudança de schema.
- Fragmento `.changes/2026-09-10-contraste-shell.md`: `nada_mudou`, correção sem ação do operador.

## Medição de navegador

Node 22.23.2, pnpm 9.15.9 via corepack, Chromium e build otimizado. Supabase local
isolado `zapfloo-contraste` (56321/56322), baseline completo + bootstrap-owner +
seed canônico. Sem chave de IA ou Resend. Não usa banco de produção.
O estado de versão instalada é fixture no banco local; o aviso de nova versão é
uma resposta HTTP controlada apenas para alcançar esse ramo do componente.

`medir-shell.mjs` usa `getComputedStyle`, converte cores CSS pelo canvas do
Chromium, compõe alpha sobre os fundos ancestrais e calcula luminância sRGB.
Captura também `getBoundingClientRect`. Arredondamento do canvas difere em
centésimos do axe: por isso não se equiparam 3,83 e 3,81 como números exatos.
O limiar é 4,5:1, sem arredondar antes de comparar.

| Texto / estado | Claro desktop | Claro 390px | Escuro desktop | Escuro 390px |
|---|---:|---:|---:|---:|
| Título antes | 3,83 | 3,81 | 3,77 | 3,79 |
| Versão instalada antes | 2,43 | 2,33 | sem reprovação | sem reprovação |
| Aviso antes | 1,17 | 1,12 | sem reprovação | sem reprovação |
| Título e versão corrigidos | 7,14 | 6,99 | 7,30 | 7,26 |
| Aviso corrigido | 18,52 | 17,74 | 19,78 | 19,43 |

## Living System Checklist

Fonte: `compactAreas()` e `useSystemVersion()`; consumidores: títulos/rodapé em
`SidebarContent`, desktop e gaveta mobile. Portas existentes e links preservados.
Não há mutação de negócio, nova atividade, configuração, decisão automatizada ou
handoff: log/anti-morte/laço de aprendizagem de runtime não se aplicam a uma troca
de classe CSS. O retorno de QA é o contraste abaixo do limiar reprovando as specs.
Nenhuma peça/aresta de arquitetura foi criada; mapas existentes não mudaram.

## Comandos e resultados

Todos executados com Node 22 e `corepack pnpm`, neste worktree. `E2E_PORT=3220`
e `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:56322/postgres` são
overrides do ambiente isolado (o gerador canônico usa 54322 por padrão).
O teto de login por IP foi configurado como 1000 no harness para as rodadas
repetidas. Redis não foi iniciado: o app usou seu fallback em memória; os avisos
de conexão recusada constam dos logs. Não se alega prova de rate limit distribuído.

| Comando | Resultado medido |
|---|---|
| `corepack pnpm gov:verify` | Exit 0; 748 arquivos, 7.868 testes. Lint 0 erros / 310 warnings existentes. |
| `corepack pnpm exec vitest run tests/unit/tailwind-tokens.test.ts tests/unit/branding.test.ts` (baseline) | Exit 0; 41/41. |
| `corepack pnpm exec playwright test tests/e2e/rbac-roles.spec.ts:118 tests/e2e/rbac-roles.spec.ts:131 --project=chromium` (antes) | Exit 1; 2/2 reprovam por contraste de 3,81:1. |
| `corepack pnpm exec playwright test tests/e2e/rbac-roles.spec.ts --config=.superpowers/evidence/contraste-shell/playwright-temas.config.ts` | Exit 0; 8/8, quatro casos por tema. Config adicional muda apenas o ambiente do browser. |
| `corepack pnpm exec playwright test tests/e2e/fluxo-controles-contraste.spec.ts tests/e2e/agenda-kit-visual.spec.ts --grep 'zoom legível\|as oito trilhas' --project=chromium` | Exit 0; 2/2, com ambos os temas medidos pelas próprias specs. |
| `node .superpowers/evidence/contraste-shell/medir-shell.mjs before` | Exit 1; mede e denuncia os textos abaixo de 4,5:1. |
| `node .superpowers/evidence/contraste-shell/medir-shell.mjs green` | Exit 0; oito estados, nenhum texto medido abaixo de 4,5:1. |
| `corepack pnpm release:conferir` | Exit 0; dry-run, não cria release. |

O `gov:verify` foi concluído **antes** da sabotagem, sem alterações nos componentes
durante a corrida. Hashes da correção que passou:

- Sidebar: `b8f5ff6068c6cfc5314392eaa3a6a5aea15746fd1bdcde48aa016a1982c92e0c`.
- VersionFooter: `cc65f108cd26a553230e5703fbfaed3700df4add22b0a44ab3581c971adc3435`.

### Sabotagem executada

Somente o h2 voltou de `/60` para `/40`; o rodapé permaneceu corrigido. Novo
`e2e:build` (exit 0), seguido dos casos `rbac-roles.spec.ts:118` e `:131` na
configuração de dois temas: **exit 1, 4/4 falharam por contraste**, 3,81:1 no claro
e 3,76:1 no escuro pelo axe. Não foram alterados assertions, retries ou timeouts.
`medir-shell.mjs mutant` também saiu 1: oito estados com somente `Crescimento`
abaixo do limiar. Portanto o defeito do título afeta ambos os temas, não apenas o claro.

Os casos de agenda/controles são controles independentes; não se afirma que
alterar um título da sidebar deva reprová-los. Forçar dez testes distintos a
falharem adulteraria a prova: o log original corresponde a dois casos, repetidos.

Após restaurar `/60`, os dois hashes acima voltaram a coincidir. Novo build
otimizado saiu 0 e a spec inteira de RBAC nos dois temas voltou a **8/8, exit 0**
(`rbac-restored-temas.log`). Nenhuma spec foi alterada entre vermelho e verde.
`medir-shell.mjs restored` saiu 0: oito estados sem falhas, valores de contraste
e cores idênticos aos da medição verde anterior à sabotagem. Correção salva no
commit `13c84b04c`; relatório e evidências seguem em commit separado.

## Fechamento

| Concluído e testado | Pendente | Bloqueado |
|---|---|---|
| Três classes corrigidas em dois componentes; fragmento; medição desktop/mobile e claro/escuro; gov:verify; RBAC; contraste de agenda/fluxos; sabotagem. | Revisão e integração da branch. | Nenhum bloqueio restante para o conserto local. |
| Zero mudanças em schema, specs existentes e inventário de hexes. | Deploy somente em lote autorizado. | CI remoto/VPS não são alegados como testados. |

## Limites da prova

- Testes locais neste worktree; não é uma nova execução no checkout principal ou no CI.
- Não testa deploy/VPS, atualização real do servidor, chamadas de IA, WhatsApp ou faturamento.
- Chromium desktop e viewport mobile, não dispositivos físicos, Safari ou Firefox.
- Não roda toda a suíte E2E nem a suíte RLS: este lote não altera banco nem permissões.
- O inventário amplo de hexes (incluindo SVGs/fixtures) é comparado byte a byte antes/depois;
  não é apresentado como uma recontagem do teto de 20 hexes de UI referido na triagem.
- O harness de medição inicialmente encontrou versão vazia no banco fresco e depois
  seletor `aside` ambíguo. Foi semeada a versão local e selecionada `aside.bg-shell`;
  esses erros de preparação não são apresentados como vermelho do produto.

Logs, medições JSON e screenshots: `.superpowers/evidence/contraste-shell/`.
