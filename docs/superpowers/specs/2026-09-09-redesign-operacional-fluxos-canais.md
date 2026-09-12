# Especificação — acabamento operacional, fluxos e canais

**Status:** aprovado pelo proprietário em 2026-09-09; implementação autorizada.

## Objetivo

Concluir o redesign operacional já iniciado, tornando navegação, painel, fluxos,
canais e áudio coerentes e responsivos. A referência externa orienta hierarquia,
densidade e fluidez, mas o produto preserva marca, vocabulário, permissões e
componentes próprios.

## Entregas aprovadas

1. A barra lateral permanece fixa durante o scroll e recebe logo, cartão da
   empresa ativa, busca, ação Pergunte à IA e navegação compacta organizada em
   trabalho diário e crescimento.
2. O menu expõe apenas rotas reais: Painel de controle, Conversas, Calendário,
   Contatos, Leads, Agentes de IA, Relatórios e Configurações. Funções profundas
   continuam acessíveis pela busca e pelos hubs existentes.
3. A nova marca SVG fornecida pelo proprietário substitui apenas o asset estático
   confiável da instalação; upload arbitrário de SVG continua proibido.
4. O dashboard mantém dados reais e ganha modo de edição direto: widgets podem
   ser arrastados, redimensionados entre tamanhos permitidos, ocultados, salvos,
   cancelados e restaurados. Controles por teclado permanecem disponíveis.
5. Gráficos, números e textos não podem escapar de cards em desktop, tablet ou
   celular. Estados vazio, loading e erro mantêm dimensões estáveis.
6. Follow-ups ficam encontráveis por navegação e busca. O construtor usa apenas
   nós, campos e operadores executados pelo motor real.
7. Criar com IA transforma uma descrição em um rascunho de fluxo validado. O
   usuário revisa e publica manualmente; a IA nunca publica sozinha.
8. Conexões mostram em uma visão os canais configurados e distinguem claramente
   WhatsApp por QR/WAHA, API Oficial da Meta e provedor parceiro.
9. Áudios do WhatsApp podem ser reproduzidos e, quando a derivação estiver
   disponível, exibem transcrição e entregam texto derivado ao agente. Falha de
   transcrição não bloqueia a conversa e não vaza PII em logs.
10. A integração oficial da Meta recebe uma jornada BYO compatível com o modelo
    self-host: cada instalação conecta seu próprio app, WABA e número, valida os
    dados antes de persistir e recebe callback e verify token prontos para colar
    na Meta. Embedded Signup não será apresentado como caminho desta arquitetura.

## Limites seguros

- A busca global deste lote encontra telas e recursos. Busca transversal por
  contatos, mensagens e leads exige um contrato próprio de autorização, índice
  e retenção e não será simulada por resultados fictícios.
- Não serão inventados Marketing, Sites ou campanhas se a rota e o produto real
  não existirem. A seção Crescimento usa apenas capacidades comprovadas.
- Não serão criados operadores de fluxo sem implementação equivalente no worker.
- Tokens oficiais da Meta nunca chegam ao navegador nem são gravados em claro em
  logs. O onboarding oficial fica desabilitado com instrução acionável enquanto
  a instalação não tiver configuração suficiente.
- Nenhuma migration aplicada será alterada.

## Critérios de aceitação

1. A posição vertical da sidebar não muda quando o conteúdo rola.
2. O nome da empresa ativa é visível e não é confundido com a marca da instalação.
3. Todos os links do menu levam a páginas existentes e respeitam papel e tenant.
4. Drag, resize, teclado, salvar, cancelar e restaurar do painel têm testes.
5. Nenhum widget produz overflow horizontal nos viewports alvo.
6. Fluxo criado por IA passa pelo mesmo schema do editor e nasce como rascunho.
7. QR/WAHA e API Oficial nunca aparecem como a mesma conexão.
8. Reprodução, transcrição, fallback e consumo do texto derivado têm prova.
9. Typecheck, lint, unitários, testes de banco quando aplicáveis, build e jornadas
   Playwright relevantes terminam com código zero.
10. A publicação permanece uma etapa posterior e explícita.
