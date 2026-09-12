---
impacto: capacidade_nova
secao: adicionado
titulo: Ensaio de texto antes de ativar o agente
---

- A configuração salva pode preparar um modelo explicitamente escolhido, ensaiar uma mensagem sintética e registrar a revisão da resposta sem conectar canal ou ativar atendimento.
- Falhas, respostas vazias ou interrompidas e alterações na configuração não produzem uma prova revisável. A última execução e seleção podem ser retomadas.
- O teste pode consumir API e respeita o orçamento canônico. Limites técnicos da prévia: mensagem de até 4.000 caracteres, saída de até 1.200 tokens e 12.000 caracteres, timeout de rede de 30s, lease de 60s e contador compartilhado de 6 tentativas por minuto por organização (fallback por processo quando Redis indisponível).
- Migration 0223 aditiva no baseline. Esta prévia não valida ferramentas, memória, WhatsApp nem a jornada completa de instalação.
