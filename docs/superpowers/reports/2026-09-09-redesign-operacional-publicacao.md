# Publicação do redesign operacional — 2026-09-09

## Resultado

O redesign operacional foi publicado em `crm.zapfloo.tech` a partir do commit local
`c9f20c757cd614ae5b138b41c22ac9370d6183ee` e identificado no runtime como
`c9f20c75`.

Escopo confirmado em produção:

- navegação principal compacta;
- dashboard operacional e personalizador de widgets;
- área **Pergunte à IA** em modo somente leitura;
- nova hierarquia visual em Contatos;
- navegação contextual da área de agentes;
- preferência do dashboard persistida por usuário.

Nenhuma pergunta foi enviada ao provedor de IA e nenhuma mensagem de WhatsApp foi
disparada durante a publicação ou o smoke test.

## Proteção e banco de dados

Backups criados antes da alteração:

- banco: `/opt/zapfloo/backups/db-20260909-180758.sql.gz`;
- WAHA: `/opt/zapfloo/backups/waha-20260909-180758.tgz`.

O `baseline.sql` foi aplicado pelo caminho de atualização suportado. A verificação
estrutural confirmou:

- tabela `user_dashboard_preferences` existente;
- RLS ativada;
- quatro políticas de acesso instaladas.

A alteração de banco é aditiva. Em caso de rollback apenas do aplicativo, a tabela
pode permanecer sem afetar a versão anterior.

## Imagem e serviços

Imagem produzida na própria VPS:

- tag: `zapfloo-app:c9f20c75`;
- ID: `sha256:00f6e7d723b758674ed8f17bfed6a5e02c5aa92cc76d2c6762c3f77de8a17d01`;
- tamanho informado pelo Docker: `153485069` bytes.

O deploy usou os arquivos de composição existentes, incluindo as labels do proxy,
mais o override da release:

`/opt/zapfloo/releases/c9f20c75/docker-compose.operational.yml`.

Após o deploy:

- somente o contêiner `app` foi substituído;
- `worker` permaneceu com o mesmo ID;
- `scheduler` permaneceu com o mesmo ID;
- aplicativo ficou `healthy`, com zero reinícios;
- não houve linha severa nos logs recentes.

## Saúde pública e smoke autenticado

O endpoint público de saúde respondeu `healthy`, versão `c9f20c75`, com Supabase,
Redis e WAHA em estado `ok`.

O smoke test autenticado no Chrome confirmou renderização e navegação em:

- `/app`: dashboard, indicadores, filas e cards operacionais;
- modal **Personalizar painel**: oito widgets, tamanhos e reordenação;
- `/app/ai/ask`: sugestões, campo de pergunta e selo **Somente leitura**;
- `/app/contacts`: busca, filtros, ações e estado vazio;
- sidebar compacta e subnavegação contextual.

O modal foi fechado sem salvar mudanças na conta usada para o teste. A área de IA
foi inspecionada sem executar uma consulta.

## Verificação anterior à publicação

- `corepack pnpm typecheck`: exit 0;
- `corepack pnpm lint`: exit 0, sem erros e com 312 avisos preexistentes;
- `corepack pnpm build`: exit 0;
- `corepack pnpm test:unit`: 733 arquivos e 7.764 testes aprovados;
- `corepack pnpm test:db`: 163 arquivos, 1.344 aprovados e 1 ignorado;
- `corepack pnpm test:shell`: exit 0;
- Playwright focado no redesign: 3/3 testes aprovados;
- `git diff --check`: exit 0.

## Rollback

O rollback do aplicativo consiste em executar novamente o mesmo comando de deploy
com os arquivos de composição anteriores, omitindo
`docker-compose.operational.yml`. Os backups acima ficam preservados.

## Observações

- A construção direta na VPS foi uma exceção operacional porque ainda não há um
  registry privado/CI de publicação disponível para esta instalação. O caminho
  definitivo deve publicar uma imagem `amd64` versionada pelo CI.
- O build exibiu o aviso de depreciação já conhecido do Sentry. Não bloqueou a
  compilação nem a saúde do runtime, mas deve ser tratado em manutenção própria.
