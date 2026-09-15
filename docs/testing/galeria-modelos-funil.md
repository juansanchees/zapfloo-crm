# Galeria de modelos de funil — contrato e prova

Os seis modelos de nicho do onboarding e os quatro modelos da galeria são
declarados em `lib/pipelines/modelos-de-funil.ts`. Aplicar um modelo sempre cria
outro funil; não atualiza nem apaga um funil existente. Modelos de pós-venda
gravam `agent_stage_hint = null`, portanto não autorizam o agente a mover cards.

## Living System Checklist — galeria de modelos

- Quem alimenta: catálogo central e escolha explícita do manager na tela de Funis.
- Quem a peça alimenta: a API cria `crm_pipelines` e `crm_stages`, usados pelo quadro e pelos leads.
- Log emitido: `pipeline.created` em `api_audit_log`, incluindo `template_id`.
- Onde aparece: `/app/kanban`, a porta já registrada como Funis.
- Anti-morte: se as etapas falham, o funil vazio é removido e a tela mostra a recusa.
- Configuração: a mesma tela permite aplicar, abrir, renomear e arquivar o funil.
- Continuidade IA-humano: não se aplica ao pós-venda; hints nulos mantêm o movimento sob decisão humana.
- Laço de retorno: criação e erro retornam o estado relido do banco para a própria tela.
- Mapa vivo: não há peça nem porta nova; a galeria amplia a superfície já mapeada de Funis.

## Provas

- `lib/pipelines/modelos-de-funil.test.ts`: fonte única, seis nichos e quatro pós-venda sem hints.
- `app/api/v1/pipelines/route.test.ts`: criação isolada, segunda aplicação e respeito ao limite do plano.
- `tests/e2e/pipelines-gestao.spec.ts`: aplicação pela tela, etapas visíveis e ausência de transbordo em 390 px.
