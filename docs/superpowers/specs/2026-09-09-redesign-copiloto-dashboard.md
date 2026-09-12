# Especificação — redesign operacional, Pergunte à IA e dashboard personalizável

**Status:** aprovado pelo proprietário em 2026-09-09; implementação autorizada.

## Objetivo

Elevar as superfícies operacionais do produto ao padrão de clareza das referências
enviadas, sem copiar identidade, dados fictícios ou regras de outro CRM. O lote
entrega uma navegação compacta, um workspace mais claro e consistente, um copiloto
de consulta ao CRM e um dashboard reorganizável por pessoa.

## Princípios do redesign

- A marca continua resolvida pelos mecanismos de white-label do produto. Nenhuma
  tela nova escreve "Zapfloo" como constante alcançável pelo usuário.
- No tema claro, a moldura de navegação usa grafite profundo e o espaço de trabalho
  usa superfícies claras. No tema escuro, o espaço de trabalho mantém superfícies
  escuras próprias; não é uma simples inversão.
- A cor configurada pelo operador é usada em ação primária, foco e item ativo. O
  roxo da instalação Zapfloo não vira uma constante universal da imagem Docker.
- Tabelas, filtros, tabs, botões, campos, cards e estados vazios compartilham os
  mesmos tokens. A referência é de hierarquia e densidade, não de trade dress.
- A direção grafite + marca em runtime já adotada pelo produto passa a ser
  reconciliada com a documentação canônica do design system, em vez de existir
  apenas em `app/globals.css`.
- A navegação primária permanece curta. Ferramentas especializadas aparecem nas
  tabs da área, nos hubs e na busca global.
- **Pergunte à IA** aparece como ação global destacada acima das áreas, sem virar
  um nono item dentro da lista principal compacta.

## Superfícies deste lote

1. **Moldura do app:** sidebar compacta, cabeçalho contextual, busca global,
   seletor da organização, perfil e comportamento responsivo.
2. **Início:** dashboard operacional e modo de personalização.
3. **Pergunte à IA:** página própria de consulta ao CRM.
4. **Conversas:** preservar o inbox de três colunas, refinando cabeçalhos,
   filtros, lista, conversa e painel de contexto.
5. **Agenda:** calendário, filtros e criação de compromisso usando a lógica já
   existente.
6. **Contatos:** tabela, busca, filtros e ações existentes.
7. **Funis:** kanban, filtros e cards existentes.
8. **Agentes de IA:** lista, métricas e atalhos para as configurações existentes.

As telas profundas de Configurações, LGPD, auditoria e integrações recebem a nova
moldura e os componentes compartilhados, mas não terão seus fluxos reescritos
neste lote.

## Pergunte à IA — contrato da primeira versão

### O que faz

- Responde perguntas sobre conversas, contatos, oportunidades, funis, agenda,
  equipe, tarefas, follow-ups, clientes em risco, produtos e pedidos acessíveis
  ao usuário autenticado.
- Pode resumir, comparar, agrupar e sugerir próximos passos, deixando claro
  quando faltam dados.
- Mostra quais fontes internas consultou e oferece links para abrir os registros
  correspondentes no CRM.
- Usa o seam canônico `runModelCall`, herdando provedor, modelo habilitado,
  credencial, orçamento, registro de custo e observabilidade da organização.
- Vive em `/app/ai/ask`, com porta no registry de navegação, na ação global e na
  busca do app.

### O que não faz

- Não envia mensagens, não move oportunidades, não cria ou conclui tarefas, não
  agenda, não exclui e não altera qualquer registro.
- Não recebe SQL, service key ou acesso livre ao banco.
- Não afirma ter consultado uma fonte que nenhuma ferramenta executou.
- Não persiste o conteúdo da conversa nesta primeira versão. O histórico vive
  apenas enquanto a página está aberta; persistência pesquisável fica fora do
  lote para não criar retenção nova de dados pessoais sem contrato de LGPD.

### Ferramentas e segurança

- A rota é `POST /api/v1/ai/ask`, com Zod, `requireRole("agent")`, request id,
  rate limit por organização + usuário e respostas pelos wrappers canônicos.
- O servidor monta uma allowlist curta de ferramentas do catálogo MCP marcadas
  como `risco="seguro"`. Filtrar apenas pela categoria não basta: a allowlist
  explícita impede que uma ferramenta nova passe a entrar sem revisão.
- A identidade do usuário e a organização ativa vêm da sessão validada. Toda
  consulta mantém `organization_id` explícito e aplica o papel real do usuário.
- A ponte registra cada consulta sem gravar telefone, e-mail, pergunta completa
  ou resultado com PII no audit log.
- O limite inicial é de 2.000 caracteres por pergunta, até seis mensagens de
  contexto e oito passos de ferramenta. Timeout e teto de saída são definidos
  no servidor. Esses limites são técnicos, não planos comerciais.
- O backend deriva `sources` das ferramentas realmente executadas. A resposta
  textual do modelo não controla a lista de evidências.

### Resposta da API

```json
{
  "data": {
    "answer": "texto em linguagem natural",
    "sources": [
      { "kind": "pipeline", "label": "Funil Pedidos", "href": "/app/kanban" }
    ],
    "consulted_tools": ["crm_list_leads"]
  }
}
```

Erros de credencial, saldo, orçamento, timeout e ferramenta indisponível chegam
à tela com mensagem acionável. Nenhum desses casos é exibido como resposta vazia
ou sucesso.

## Dashboard personalizável

### Experiência

- O botão **Personalizar painel** abre um modo explícito de edição.
- O usuário pode exibir/ocultar, reordenar e escolher entre tamanhos permitidos
  para cada widget. Não existe editor de código, SQL ou consulta arbitrária.
- Há prévia durante a edição, ações **Salvar**, **Cancelar** e **Restaurar padrão**.
- A página continua utilizável durante falha de preferências: mostra o layout
  padrão e informa que a personalização não foi carregada.
- O período global controla widgets compatíveis. Widget incompatível mantém seu
  próprio contexto e deixa isso legível.
- Em telas estreitas a ordem é preservada, mas todos os widgets ocupam uma
  coluna; a preferência de desktop não produz overflow no celular.

### Catálogo inicial de widgets

- Resumo de conversas.
- Fila de atendimento.
- Oportunidades por etapa.
- Conversão do período.
- Tarefas e compromissos próximos.
- Conversas recentes.
- Agentes ativos.
- Clientes que precisam de atenção.

Cada widget tem id estável, tamanhos aceitos e papel mínimo num catálogo central.
O servidor remove ids desconhecidos e widgets acima da permissão antes de
responder; o cliente nunca decide autorização.

### Persistência

Nova tabela tenant-aware `user_dashboard_preferences`:

- `organization_id uuid not null`;
- `user_id uuid not null`;
- `layout jsonb not null`;
- `schema_version smallint not null default 1`;
- `updated_at timestamptz not null`;
- chave primária composta por organização e usuário.

O JSON possui schema Zod central e versionado; componentes não leem paths livres.
A tabela tem RLS para que a pessoa leia e altere apenas sua própria preferência
dentro de uma organização da qual ainda é membro. Service role, se necessário,
continua filtrando os dois identificadores.

Contrato HTTP:

- `GET /api/v1/dashboard/preferences` devolve preferência sanitizada ou o
  default canônico.
- `PUT /api/v1/dashboard/preferences` substitui o layout completo validado,
  faz upsert idempotente e audita `dashboard.preferences_updated`.
- `DELETE /api/v1/dashboard/preferences` restaura o default removendo somente a
  preferência da pessoa e audita `dashboard.preferences_reset`.

## Estados e acessibilidade

- Todos os controles funcionam por teclado, têm foco visível, rótulo acessível
  e área de toque adequada.
- Loading usa skeleton com dimensões estáveis; erro preserva contexto e oferece
  nova tentativa; vazio explica o primeiro passo real.
- Gráficos têm resumo textual e não dependem só de cor.
- `prefers-reduced-motion` desliga movimentos não essenciais.
- Português e espanhol entram na mesma entrega; strings não ficam soltas nos
  componentes.

## Dados, banco e distribuição

- A preferência do dashboard será entregue por migration nova, apêndice
  idempotente do `baseline.sql`, linha no `MANIFEST.md`, tipos regenerados e
  teste de isolamento entre duas organizações.
- Nenhuma migration aplicada será editada.
- A feature não exige variável de ambiente nova. Usa a configuração de IA já
  existente na organização.
- A imagem continua white-label e self-host. Mudança visível recebe fragmento
  em `.changes/`; publicação continua pelo fluxo de CI e imagens versionadas.

## Observabilidade e laço de retorno

- Toda pergunta gera `llm_calls` com `purpose="copilot_query"`; tool calls
  realmente executadas são auditadas com argumentos higienizados.
- Erros ficam visíveis na tela e nos logs estruturados, sem pergunta, telefone,
  e-mail ou segredo.
- Métricas mínimas: chamadas, latência, custo, sucesso/erro e ferramentas
  consultadas. Não criar telemetria externa nova.
- Se uma fonte falha, a IA informa que a análise está incompleta; não preenche a
  lacuna por inferência silenciosa.
- A arquitetura viva terá entradas para o copiloto e as preferências do painel,
  cada uma com suas entradas, consumidores e retorno em caso de erro.

## Ordem de implementação

1. Consolidar tokens/componentes e finalizar a moldura compacta já iniciada.
2. Reestruturar o dashboard sobre as APIs reais atuais.
3. Entregar persistência e modo de personalização do dashboard.
4. Entregar a rota e a página Pergunte à IA em modo somente-leitura.
5. Aplicar os componentes compartilhados às demais superfícies do lote.
6. Executar gates de código, banco, build e jornadas visuais em ambiente fresco.

As etapas são internas; a entrega ao usuário é um único lote coerente. Cada etapa
mantém um checkpoint reversível para não deixar uma tela grande sem saída.

## Fora deste lote

- Ações de escrita pela IA, mesmo com confirmação.
- Envio de WhatsApp, automações ou campanhas a partir do copiloto.
- Histórico persistente, compartilhamento ou busca de conversas do copiloto.
- Construtor arbitrário de widgets e fórmulas.
- Copiar nome, logotipo, dados demonstrativos ou assets das referências.

## Critérios de aceitação

1. A navegação principal cabe na altura alvo sem esconder funcionalidades.
2. As sete superfícies principais compartilham hierarquia e componentes, mantendo
   seus dados e permissões reais.
3. A IA responde apenas com ferramentas de leitura e nunca produz mutação, envio
   ou registro fora do tenant.
4. Fontes exibidas correspondem a ferramentas executadas.
5. Um usuário salva e restaura seu painel; outro usuário e outra organização não
   veem nem alteram essa preferência.
6. Layout inválido, antigo ou contendo widget sem permissão degrada para uma
   versão sanitizada, sem quebrar a página.
7. Typecheck, lint, unitários relevantes, `test:db`, build e E2E das jornadas
   novas passam com saída verificável.
8. Desktop, tablet, celular, temas claro/escuro e idiomas pt-BR/es são provados
   visualmente por Playwright em instalação fresca.
9. Nenhuma pergunta real, resposta com PII, token ou credencial aparece em
   screenshot, fixture, log ou commit.
