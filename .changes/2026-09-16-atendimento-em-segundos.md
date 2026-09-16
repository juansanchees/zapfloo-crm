---
impacto: nada_mudou
secao: corrigido
titulo: Mensagens novas acordam o atendimento sem esperar o próximo minuto
---

O worker agora confere mensagens novas no máximo a cada 2 segundos quando está ocioso, mantendo a janela configurável de 8 segundos que agrupa mensagens consecutivas e o agendamento periódico como segurança.
