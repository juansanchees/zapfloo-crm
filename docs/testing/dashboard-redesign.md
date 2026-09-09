# Dashboard — aplicação do layout aprovado

Data: 2026-09-09. Alteração local na branch `codex/onboarding-roxo`, base `d8e6cfea`.

## Escopo confirmado

- `/app` deixa de redirecionar e passa a oferecer a Visão geral. O destino do login e o onboarding não mudam.
- Sidebar e busca encontram a nova tela; todos os grupos e destinos anteriores permanecem acessíveis.
- Cards, painéis e botões usam tokens existentes da marca, com suporte a claro/escuro e celular.
- Contagens e conversas vêm dos endpoints canônicos, com o mesmo escopo do usuário. Métricas exigem agent; agentes exigem manager. A API continua sendo a autoridade de permissão.
- Oportunidades ganhas: soma da API de métricas, somente com responsável, nos últimos 30 dias. Não é receita nem a soma de negócios sem responsável.
- Tarefas: até três próximas pendências; a contagem indica `500+` ao atingir o limite da API. Conclusão aguarda PATCH real e invalida também o cache canônico de tarefas.
- Erro de leitura não vira zero; cada seção possui carregamento, vazio, erro e nova tentativa.
- Cache segregado por organização, usuário e papel. Consultas periódicas não enviam mensagens nem executam IA.

## Verificação e limites

Confirmado nesta execução: build E2E local concluído; typecheck sem erros; lint dos arquivos alterados sem erros; 152 testes direcionados em seis arquivos aprovados; três testes Playwright aprovados em 51 segundos (dashboard, menu a 900 px e gaveta mobile). Inspeção visual das capturas finais em tema escuro, com dados carregados.

Teste unitário do dashboard cobre dados, erro, RBAC, conclusão persistida/recusada e limite de listagem. A spec `tests/e2e/navegacao.spec.ts` cobre entrada pela navegação, leitura real local, atalhos, desktop, celular e ausência de overflow. As capturas são de uma organização sintética do ambiente E2E, não de clientes.

Evidências locais (não destinadas ao Git):

- `.superpowers/evidence/dashboard-desktop.png`
- `.superpowers/evidence/dashboard-mobile.png`

Pendências anteriores ao redesign, reproduzidas no baseline unitário: `canais-selecionaveis`, `evidencia-citada`, `varredura-anon-e-o-ultimo-bloco` e a asserção de `channel-sessions/[id]/ai-access`. O lint global também encontra sete erros em três scripts locais preexistentes sob `.superpowers/`; esses arquivos não foram alterados. Não declarar a suíte global verde.

Reexecução completa: 724 arquivos, 720 aprovados e os mesmos quatro reprovados; 7.709 testes aprovados e quatro reprovados (256 s). No encerramento do Playwright houve um aviso `The destination stream closed early`, após os três casos aprovados; não houve falha de asserção, mas esse log não foi tratado como prova de ausência total de erros do servidor.

Nenhuma migration, mudança de banco remoto, envio WhatsApp, commit, push ou publicação faz parte desta entrega. A prova E2E local não equivale a uma homologação da VPS.

## Reversão

Antes de publicar, manter o artefato de produção anterior. Reverter somente este conjunto de mudanças visuais e a página `/app`; não é necessário rollback de schema. Não usar reset do checkout inteiro, pois contém trabalhos anteriores. Validar login, Inbox e tarefas após eventual publicação ou reversão.

Mapa: `docs/architecture/dashboard.architecture.json`.
