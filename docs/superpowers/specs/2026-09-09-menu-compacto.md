# Especificação — navegação compacta do Zapfloo

**Status:** aprovado pelo proprietário em 2026-09-09.

## Objetivo

Reduzir o menu lateral a oito portas compreensíveis, sem remover telas, mudar
permissões ou copiar a identidade visual de outro produto.

## Menu primário

- Operação: Início, Conversas, Funis, Contatos, Agentes de IA e Relatórios.
- Rodapé: Agenda e Configurações.
- A marca Zapfloo, o tema grafite e o comportamento recolhido permanecem.

## Navegação secundária

As telas retiradas do menu lateral continuam acessíveis em uma barra contextual
no topo da área e, quando já existe, no hub completo e na busca global.

- Conversas: Conversas, Precisam de atenção e Respostas rápidas.
- Funis: Meus funis, Produtos e Etapas do funil.
- Agentes de IA: Visão geral, Agentes, Conhecimento, Retomadas automáticas,
  Distribuição e Avançado.
- Relatórios: Visão geral, Desempenho, Atividades, Meta Ads e Evolução da IA.
- Agenda: Compromissos e Tarefas.
- Configurações: Visão geral, Empresa e equipe, Conexões, Integrações e Conta e
  segurança.

## Restrições

- Nenhuma rota, dado, permissão ou recurso é excluído.
- A projeção respeita `minRole`; link sem acesso não aparece.
- A busca global continua expondo todos os destinos permitidos.
- Não há alteração de banco, Supabase, WhatsApp ou integrações externas.
- Em mobile, o mesmo menu aparece no painel lateral e a barra secundária rola
  horizontalmente sem alargar a página.

## Aceite

1. Um administrador vê exatamente as oito portas aprovadas.
2. Um papel inferior não vê áreas ou abas acima de sua permissão.
3. A área pai permanece destacada ao navegar para uma tela secundária.
4. As rotas antes diretas continuam alcançáveis pelos atalhos contextuais,
   hubs ou busca global.
5. Desktop e mobile não apresentam overflow horizontal da página.
