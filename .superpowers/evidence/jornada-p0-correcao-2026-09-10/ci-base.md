# E2E herdado — não atribuir à correção P0

Fonte medida: PR #7, SHA `ce973b4a06a56ca69637c52401e3167b631074fb`, run [34511058878](https://github.com/juansanchees/zapfloo-crm/actions/runs/34511058878). Download read-only por `gh run view 34511058878 --repo juansanchees/zapfloo-crm --log-failed`.

Total: **27 falhas / 248 passadas / 8 puladas**. Parte 1: 12F/106P; parte 2: 7F/91P/8S; parte 3: 8F/51P. `verify`, `invariants`, `build-and-size`, `imagens-ok` verdes; `e2e` vermelho.

| Grupo | Casos | Sintoma observado |
|---|---:|---|
| Ordem de onboarding, alvo desta leva | 1 | `wizard-do-funcionario:117` espera conexão, base navega para setup-ai. |
| Canvas de fluxos, fora desta leva | 12 | `fluxo-controles-contraste:6`, `fluxo-gatilho-no-editor:6`, `followup-linguagem:84`, `followup-ramos:120`, `followup-journey:224`, `followup-publicado-abre-no-construtor:77`, `followup-tempo-adaptativo:142`, `followup-builder:230/255/303/348/521`: canvas oculto ou clique interceptado pela shell. Causa de classe precisa ser medida, não presumida. |
| Portas de navegação, fora desta leva | 6 | `relatorio-de-atividades:277/429`, `risk-radar:59/70`, `vps-webhook-outbound-ssrf:96`, `webhooks:118`: links ausentes. |
| Inbox, fora desta leva | 2 | `inbox-responder-citando:73/99`: botão não aparece/clique expira. |
| Gestão de pipeline, fora desta leva | 1 | `pipelines-gestao:97`: nome não observado no primeiro item após renomear. |
| Configuração de agente, fora desta leva | 1 | `agente-novo-e-uso:132`: exigência de configuração sem links esperados. |
| i18n, fora desta leva | 1 | `i18n-espanhol-na-tela:282`: cinco textos em português no locale espanhol. |
| Indeterminados | 3 | `gatilho-de-caso:154`, `gatilho-de-etapa:140`, `followup-builder:784`: timeout com stack no POST de limpeza `/disable`. O log não prova causa de infraestrutura. |

As referências são de `tests/e2e/*.spec.ts` no run-base, não necessariamente as linhas depois da correção. Nove mensagens de destino de stream fechado foram observadas, sem ligação causal comprovada com um teste.

Não executar skips novos ou relaxar expectativas para esconder essas falhas. A correção P0 precisa medir suas specs e o CI do novo SHA; cinco checks verdes continuam pendentes enquanto o E2E agregado falhar.
