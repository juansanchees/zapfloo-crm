# Proteção de artefatos da prova fresca

Medição local em 10/set/2026, Node 22, Chromium real. Nenhuma credencial, QR, conta ou mensagem real foi usada no controle adversarial.

## DOM em falhas

Comando: `node .superpowers/fresh-p0-correcao/provar-dom.mjs` no worktree `codex/jornada-p0`.

Log local: `/tmp/zapfloo-p0-dom-real.log`; código de saída do processo principal: **0**.

| Configuração | Saída da falha deliberada | error-context gerado | Marcador fictício no artefato |
|---|---:|---:|---|
| Guard removido | 1 | 1 arquivo | Sim — controle negativo |
| Guard ativo | 1 | 1 arquivo | Não |

O teste abre uma página com marcador gerado em runtime, provoca uma asserção falsa e verifica os artefatos. O valor do marcador não é impresso. Isso comprova a captura automática real do Playwright, não somente uma leitura do código. Não significa que mensagens de erro arbitrárias sejam sanitizadas: a spec mantém asserções booleanas nas fases sensíveis.

## Cleanup da prova negativa

Comando: `node .superpowers/ci-p0-correcao/run.mjs test tests/e2e/onboarding-sem-ia.spec.ts` no perfil automático B, isolado do perfil A reservado ao pareamento.

Log local: `/tmp/zapfloo-p0-e2e-negative-fix1.log`; saída **0**, **1 passed (36.8s)**. O caso preservou erro visível, adiamento da IA, exploração sem conclusão e reentrada; o `finally` agora valida os resultados de limpeza.

Esta medição não comprova QR, pareamento ou mensagens. A prova fresca real permanece separada.
