---
impacto: nada_mudou
secao: corrigido
titulo: Retomadas aguardam a reconexão do número de origem
---

As retomadas vinculadas a uma conversa voltam a guardar a mensagem na fila
quando o número está reconectando ou aguardando leitura do QR. Quando a sessão
volta a funcionar, o resgate existente envia pelo mesmo número de origem,
sem esgotar as tentativas do trabalho de retomada durante essa espera.
Canais excluídos, inexistentes ou de outra organização continuam recusados.
Não é necessário alterar a configuração da instalação.
