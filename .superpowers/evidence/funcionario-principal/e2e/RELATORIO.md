# Duas jornadas válidas do leitor de site — verde, vermelho, verde

Medido em 13/09/2026, Node 22.23.2, pnpm 9.15.9, Chromium.

## Identidade da prova

- PR #14 intacto: `fd36bec8304aef955a41b400eca1e414db16c989`.
- Fix integrada: `bd048ad3b4d18902aefe7ad6c8b026aaadf4ea4d`.
- Cherry-pick local temporário inicial: `c596b9ddd7c11fcaa8aff7b88220303132875595`, branch `codex/prova-site-funcionario-principal`.
- Reordenação final do baseline: `cd17770dfca601516c64caac20a5729870fe3935`, integrada como `a4eeabd4a452d52bba317e4ddb243a9e6b26b0ed` na mesma branch temporária. Apenas desloca a varredura final de permissões para depois dos novos apêndices; corpo da RPC, JS e specs têm diff zero contra a integração anterior.
- Worktree: `.worktrees/prova-site-funcionario-principal`.
- Diff zero em `tests/e2e/onboarding-leitor-de-site.spec.ts` e `app/actions/onboarding/montarQuadro.ts` contra o PR #14. Nenhuma asserção removida ou afrouxada.
- Nenhum commit/push/PR da integração temporária foi publicado. A branch do PR #14 não foi atualizada.

## Ambiente

Supabase local da stack `zapfloo-site-e2e-20260912-w5bz50`: API 56521, Postgres 56522; Redis HTTP 56598. A stack original foi instalada com baseline + bootstrap-owner. Este ciclo reaplicou o **baseline integrado inteiro** com `ON_ERROR_STOP=1`, exit 0 (`baseline-integrado.log`). Não foi uma nova instalação fresca neste ciclo.

Env de teste foi gerado do status dessa stack e do cache local identificado pela label de QA, sem abrir/copiar `.env.local` ou env de produção, nem mostrar credenciais. Dependências reais: `pnpm install --frozen-lockfile --ignore-scripts --prefer-offline`, 913 pacotes reutilizados, 0 baixados, exit 0.

Build final integrado: `corepack pnpm e2e:build`, exit 0 (`build-integrado.log`). Compilação 8,1 s, TypeScript 5,3 s. Controle positivo confirmou `127.0.0.1:56521` no bundle.

## Comando das três rodadas

Mesma spec, mesmos dois nomes, sem skip/retry/alteração de teste. `--list` confirmou exatamente 2 testes em 1 arquivo.

```bash
E2E_ONBOARDING_SITE_FIXTURE=1 \
E2E_ONBOARDING_SYNTHETIC_PROVIDER=1 \
OPENAI_API_KEY=onboarding-local-provider-only \
AUTH_RATE_LIMIT_LOGIN_IP=1000 SENTRY_DSN=off \
corepack pnpm exec playwright test tests/e2e/onboarding-leitor-de-site.spec.ts \
  --grep 'site lido: (revisar|depois) é uma saída real e confirmar libera só o produto conferido' \
  --workers=1 --reporter=list,json --trace on
```

Cada rodada direcionou `PLAYWRIGHT_JSON_OUTPUT_FILE` e `--output` a seus respectivos arquivos/diretórios deste diretório. Não houve uso de chave comercial de IA: o valor acima é a constante sintética exigida pelo receiver HTTP local.

| Estado | Resultado literal | Exit | Evidência |
|---|---|---|---|
| Fix aplicada | `2 passed (28.3s)` | 0 | `verde.log`, `verde.json`, `verde-artefatos/` |
| Promoção sabotada | `2 failed` | 1 | `sabotado.log`, `sabotado.json`, `sabotado-artefatos/` |
| Fix restaurada | `2 passed (1.1m)` | 0 | `restaurado.log`, `restaurado.json`, `restaurado-artefatos/` |
| Baseline final reordenado e reaplicado | `2 passed (32.5s)` | 0 | `final.log`, `final.json`, `final-artefatos/` |

Tempos JSON completos: verde 28.325,327 ms; sabotado 39.298,94 ms; restaurado 64.854,471 ms. Todos reportaram `skipped: 0`, `flaky: 0`.

## Sabotagem exclusiva e saída vermelha

A única alteração de comportamento foi `set is_default = true` → `set is_default = false` na promoção da RPC `fn_ativar_agente_teste_onboarding`, no arquivo 0232 e no seu apêndice correspondente no baseline temporário. Demais guards, publicação, recibo, auditoria, restrição e todo código do #14 permaneceram idênticos. Diff exato: `sabotagem.diff`.

A função sabotada foi aplicada **somente ao Postgres local de QA**, exit 0 (`aplicar-sabotagem.log`). As duas jornadas continuaram a preparar, testar, revisar e ativar o agente restrito, mas voltaram ao fallback no funil e reprovaram na mesma linha 251:

```text
  ✘  1 [chromium] › tests/e2e/onboarding-leitor-de-site.spec.ts:237:59 › site lido: revisar é uma saída real e confirmar libera só o produto conferido (14.9s)
  ✘  2 [chromium] › tests/e2e/onboarding-leitor-de-site.spec.ts:237:59 › site lido: depois é uma saída real e confirmar libera só o produto conferido (13.9s)

  1) [chromium] › tests/e2e/onboarding-leitor-de-site.spec.ts:237:59 › site lido: revisar é uma saída real e confirmar libera só o produto conferido

    Error: expect(locator).toBeVisible() failed

    Locator: getByText(/Li o seu site \(https:\/\/valido\.onboarding-site\.test\/?\)/)
    Expected: visible
    Timeout: 5000ms
    Error: element(s) not found

  2) [chromium] › tests/e2e/onboarding-leitor-de-site.spec.ts:237:59 › site lido: depois é uma saída real e confirmar libera só o produto conferido

    Error: expect(locator).toBeVisible() failed

    Locator: getByText(/Li o seu site \(https:\/\/valido\.onboarding-site\.test\/?\)/)
    Expected: visible
    Timeout: 5000ms
    Error: element(s) not found

  2 failed
    [chromium] › tests/e2e/onboarding-leitor-de-site.spec.ts:237:59 › site lido: revisar é uma saída real e confirmar libera só o produto conferido
    [chromium] › tests/e2e/onboarding-leitor-de-site.spec.ts:237:59 › site lido: depois é uma saída real e confirmar libera só o produto conferido
```

O log integral inclui os dois stack traces, error-context, screenshots e traces; o bloco acima apenas omite duplicações de call log e caminhos locais longos. Nenhuma saída de falha foi substituída por relato.

Restaurados arquivo 0232 + baseline temporários, `git diff --exit-code` saiu 0. RPC correta reaplicada ao banco local, exit 0 (`restaurar-rpc.log`). Nova execução dos mesmos dois testes saiu 0. Worktree temporário terminou limpo.

Após esse ciclo, a reordenação do baseline também foi integrada e o baseline **inteiro** final reaplicado com `ON_ERROR_STOP=1`, exit 0 (`baseline-final.log`). Nenhum corpo de função ou JS mudou, por isso o bundle integrado anterior foi mantido. As mesmas duas jornadas passaram mais uma vez: revisar 12,7 s, depois 14,4 s, total `2 passed (32.5s)`, exit 0. O vermelho acima prova a atribuição da promoção; esta rodada adicional prova o produto sobre a ordem final do baseline, sem atribuir à reordenação uma alteração de comportamento que ela não faz.

## O que o verde provou pela tela

- Ensaio sem seletor técnico, revisão da resposta e ativação restrita existentes.
- Site lido entra no pedido da sugestão e a tela mostra `Li o seu site`.
- Card final tem contagens reais: um produto/um FAQ aguardando conferência.
- Revisar abre o catálogo; `Depois` esconde o card e permanece oculto após recarregar.
- Produto do site começa inativo a 12990 centavos; `Confirmar todos` ativa o registro conferido.
- FAQ não é usada antes da revisão; o botão fica desabilitado sem o checkbox.
- Pergunta/resposta editadas pela tela são persistidas com autoria, data e hash exato do conteúdo aprovado.
- Sem drain/embedding: `chunks_count=0` e `active_kb_version_id=null` continuam corretos após a confirmação.

## Medidas de layout

`getBoundingClientRect` + `getComputedStyle`, viewports **1280×844** e **390×844**, asserções inalteradas do #14. Dados completos em `verde.json` / `restaurado.json` (anexos de medidas).

- Tela de conclusão: `document.scrollWidth` 1280/390, igual à viewport; 3 controles, fonte 14px. À largura 390, controles entre x=54 e direita=259,3125.
- Tela de material aguardando revisão: documento 1280/390; 3 controles, fontes 14px/12px. À largura 390, controles entre x=65 e direita=350.
- Card de perguntas em viewport 390: x=40, largura=310, direita=350, fonte computada 16px.
- Screenshots: `done-revisar-{1280,390}.png`, `done-depois-{1280,390}.png`, `material-revisao-{1280,390}.png`; traces das três rodadas nos diretórios `*-artefatos/`.

## O que não foi medido neste ciclo

CI/GitHub, VPS/produção, pareamento/envio real de WhatsApp (canal WORKING é fixture), DNS/TLS públicos, qualidade da IA comercial, embeddings/indexação/busca RAG, as outras três jornadas do leitor, layout com 720 px de altura e controles fora das duas telas medidas. Invariantes de banco da fix e caminho legado são responsabilidade das outras provas da tarefa, não desta execução E2E.

Os traces/JSON são artefatos **locais de QA**: podem conter cookies/tokens da stack fictícia e não devem ser publicados integralmente no PR. Use os logs e trechos higienizados do relatório.
