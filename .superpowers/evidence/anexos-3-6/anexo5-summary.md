# Anexo 5 — registro do ensaio de onboarding

## Causa raiz

- Emissor real: `lib/onboarding/executar-ensaio.ts`, com
  `purpose: "onboarding_rehearsal"`.
- O gate em `tests/unit/pontos-de-ia-completude.test.ts` reconhecia somente
  literais entre aspas simples; por isso o ponto ausente de `PONTOS_DE_IA`
  ficava invisível.
- Uma varredura AST ampla de toda propriedade `purpose` revelou três falsos
  positivos reais em `lib/followup/node-handlers.ts`: `plan_timing`, `classify`
  e `send_message`. Esses objetos são resultados intermediários do motor de
  fluxo, não entradas de `runModelCall`.
- A restrição final segue o fluxo até o seam: reconhece importações e aliases
  de `runModelCall`, resolve objetos literais passados diretamente ou por
  variável intermediária, acompanha spreads e aceita `purpose` com chave
  identificadora ou citada. Assim remove os falsos positivos sem voltar a
  esconder uma entrada construída antes da chamada.
- Declarações intermediárias são indexadas por escopo lexical, não por um mapa
  global de nome. Duas funções podem usar `const input` sem a segunda
  sobrescrever a entrada que a primeira passa ao seam.
- `selectionMode: "explicit"` faz `runModelCall` preservar provider, modelo e
  credencial capturados pelo ensaio e não consultar o binding como decisão de
  roteamento. O `purpose` continua alimentando o gate de orçamento e a linha em
  `llm_calls`.

## Provas

- `anexo5-red.log`: o novo controle negativo de aspas duplas falha antes da
  correção do scanner.
- `anexo5-sabotage-double-quote.log`: um chamador temporário real com
  `purpose: "sabotagem_desconhecida"` faz o gate reprovar e nomeia o arquivo; o
  chamador foi removido em seguida.
- `anexo5-red-intermediate-quoted.log`: os controles novos provam, antes do
  ajuste, os dois furos de objeto intermediário e chave citada.
- `anexo5-sabotage-intermediate-quoted.log`: um chamador temporário com objeto
  intermediário e `"purpose"` citado faz o gate real reprovar; o arquivo foi
  removido em seguida.
- `anexo5-green-intermediate-quoted.log`: 23 testes direcionados verdes depois
  de fechar os dois furos.
- `anexo5-red-lexical-scope.log`: o controle com dois `const input` em funções
  distintas prova a sobrescrita do mapa global antes da correção.
- `anexo5-sabotage-lexical-scope.log`: a mesma colisão, inserida temporariamente
  na varredura real, reprova com `sabotagem_lexical`; o arquivo foi removido.
- `anexo5-green-lexical-scope.log`: 24 testes direcionados verdes com resolução
  lexical.
- `anexo5-restored-green.log`: scanner restaurado + executor do ensaio,
  21 testes verdes.
- `anexo5-typecheck.log`, `anexo5-lint-full.log` e
  `anexo5-release-conferir.log`: verificações de tipagem, lint e fragmento.

## Living System Checklist — ponto `onboarding_rehearsal`

- Entrada: `app/actions/onboarding/ensaio.ts` chama
  `lib/onboarding/executar-ensaio.ts` com o snapshot capturado pela RPC.
- Saída: `runModelCall` produz a prévia textual e o `call_id` consumidos pela
  finalização/revisão do ensaio.
- Atividade/log: `llm_calls`, com `purpose = onboarding_rehearsal`; o orçamento
  canônico é aplicado antes da saída ao provedor.
- Tela: `app/onboarding/setup-ai/_ensaio.tsx`; inventário e consequência da
  falha em `/app/ai/providers` e `/app/ai/runs`.
- Porta: onboarding em andamento abre `setup-ai`; Provedores e Execuções de IA
  já são destinos de `lib/navigation/registry.ts`.
- Anti-morte: falha volta como estado explícito do ensaio; o scanner AST e o
  controle negativo impedem o ponto de sumir do inventário em silêncio.
- Configuração: provider, modelo e credencial são escolhidos no próprio ensaio;
  `fixo` impede criar binding no painel que `selectionMode: "explicit"`
  ignoraria.
- Continuidade IA-humano: a prévia é mostrada para revisão humana; não há canal,
  ferramenta, contato nem handoff de atendimento.
- Laço de retorno: resposta vazia, incompleta ou erro preservam a revisão como
  pendente e mostram o próximo passo na tela; a falha também aparece em
  Execuções de IA quando existe `llm_calls`.
- Mapa vivo: `docs/architecture/onboarding-ensaio.architecture.json` já contém
  `model`, `audit` e as arestas `e3`, `e4`, `e5`, `e9` e `e11`; nenhuma peça ou
  aresta nova foi criada por esta correção de completude.
