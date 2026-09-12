# Publicação do dashboard Zapfloo — 2026-09-09

## Escopo e artefato

Autorização explícita do proprietário para publicar o dashboard aprovado. Commit local `5d49362e9e10a32c6f81a1e5625340b52a0ee8f7`, branch `codex/onboarding-roxo`. Sem push, GitHub Actions, registry, alteração de banco ou envio WhatsApp. Somente app; worker/agendador continuam na versão `90456dec`, conforme exceção de atualização visual desta instalação.

Evidências de testes locais e limites: `docs/testing/dashboard-redesign.md`. As quatro falhas unitárias preexistentes e os erros de lint dos scripts locais não são declarados resolvidos.

## Transporte e incidente detectado

SSH respondeu uma vez e depois apresentou timeouts. Foi utilizado o console Hostinger já autenticado, sem alterar firewall, credenciais ou chaves. Reconstrução do source a partir do arquivo anterior, checksum `96ff95c0f72eb12d4efd775782a71dca6299bba999376dafffc83b56ca28cbd1`, mais patch binário comprimido do diff `582ea60f..5d49362e`, checksum `65fab669ab2af706ebbf97940145dd2a7131229e6004d36e07859eb3491cb993`.

A primeira aplicação do patch retornou zero mas ignorou os arquivos por detectar o repositório pai `/opt/zapfloo`. O primeiro build, portanto, continha a UI anterior apesar da nova label. A inspeção autenticada detectou o redirecionamento antigo em `/app`; a imagem anterior `zapfloo-app:582ea60f` foi restaurada imediatamente. Não houve mudança de dados.

Causa confirmada com `git rev-parse --show-toplevel` e `git apply --check --verbose` (`Skipped patch`). Correção operacional: `GIT_CEILING_DIRECTORIES=/opt/zapfloo/releases/5d49362e git apply`, executado dentro de `source`. Aplicação dos 19 arquivos confirmada, hashes dos nove arquivos de produto comparados aos locais. Novo build usa tag distinta `zapfloo-app:5d49362e-r2`; não reutilizar a imagem da primeira tentativa.

Houve também uma falha inicial de formatação do override no transporte pelo console, recusada pelo Compose antes de recriar o app; corrigida usando quebras de linha explícitas. Logs de tentativas preservados.

## Validação final

Publicação concluída em 2026-09-09 às 05:35 UTC (02:35 BRT). Imagem `zapfloo-app:5d49362e-r2`, arquitetura `amd64`, ID `sha256:8951f71c98b8d0699476b2972888a295e7336122e563c09cfe9a2096b8bcdb81`. Build nativo e TypeScript concluídos, `build.exit = 0`; script operacional registrou `DEPLOYED`, contêiner `healthy`.

Probe público HTTPS em 05:36:32 UTC retornou versão `5d49362e`, `healthy`, Supabase/Redis/WAHA `ok`. Login e logo retornaram sucesso no script. Isso não prova pareamento do número.

Chrome autenticado: `/app` mostrou Visão geral, título “Vamos fazer o dia render?”, cards, funil e estados vazios carregados, sem alertas de erro nas seções. Atalho Abrir conversas levou à Inbox; navegação Tarefas carregou a tela existente; retorno à Visão geral aprovado. Screenshot inspecionado, não salvo no repositório por ser produção. As contagens zero e a organização ainda em configuração correspondem à conta aberta; nenhum dado foi criado para preencher a tela.

Diff dos registros de contêineres: somente app mudou de `664a0d7519fe` para `a45a8e13a492`. Worker, scheduler, Caddy, WAHA, SRH e Redis mantiveram IDs/imagens. Nenhum envio WhatsApp, migration, alteração de marca ou configuração privada foi realizado.

A reversão ao app anterior foi efetivamente exercitada durante a correção do transporte. O rollback de banco não se aplica a esta alteração exclusivamente visual. A verificação de produção é um smoke test autenticado, não uma declaração de ausência de todos os bugs.

## Comandos operacionais

Diretório real `/opt/zapfloo`, proxy Caddy. Artefatos e logs em `/opt/zapfloo/releases/5d49362e/`. Nenhum `.env` foi aberto; o Compose consome a configuração existente.

Atualização do app (somente depois de build aprovado):

```sh
cd /opt/zapfloo
docker compose -p zapfloo --env-file .env -f docker-compose.prod.yml -f releases/90456dec/docker-compose.release.yml -f releases/582ea60f/docker-compose.redesign.yml -f releases/5d49362e/docker-compose.dashboard.yml up -d --no-deps app
```

Rollback: mesmo comando sem o último override. Manter a imagem anterior `zapfloo-app:582ea60f`, ID `sha256:bc63c204c8d3f59fd5886040af279b0d7f4c07c07cafb22363c49397e045cd90`. Sem restauração de banco, remoção de volumes, pruning ou reversão de branding. O script operacional `deploy.sh` tenta rollback se Compose ou probes HTTPS falharem.
