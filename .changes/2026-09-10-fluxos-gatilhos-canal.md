---
impacto: nada_mudou
secao: corrigido
titulo: Gatilhos acessíveis e follow-ups preservando o número de origem
---

- O nó inicial do editor oferece a configuração do gatilho, com caminhos para números conectados, agente e regra de entrada; distingue salvar gatilho de salvar desenho.
- Follow-ups com conversa vinculada preservam o canal de origem no worker e no envio inline. Canal inválido, arquivado ou desconectado interrompe a tentativa, sem substituí-lo silenciosamente por outro número.
- Cobertura de regressão inclui persistência do gatilho pelo navegador e isolamento/roteamento do canal em PostgreSQL real.
