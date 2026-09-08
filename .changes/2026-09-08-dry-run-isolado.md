---
impacto: nada_mudou
secao: corrigido
titulo: Teste do agente bloqueia ferramentas reais
---

- O teste legado bloqueia todas as ferramentas antes dos handlers, inclusive leitura e transferência, e registra a recusa no histórico. Não emite eventos operacionais de início/fim.
- A tela esclarece que o resultado não comprova operações reais. Consumo do modelo e registros técnicos continuam; atendimento normal não muda.
- O histórico mostra também chamadas agrupadas pelo runtime, incluindo a recusa, sem perder compatibilidade com registros planos antigos.
- O painel de teste respeita a largura do celular; detalhes longos ficam com rolagem interna.
