# Publicação Zapfloo — publicação controlada concluída

## Resultado em 2026-09-09, 03:08 UTC

Candidato `90456decfb2c9b3e4d19154db81f6492bf4fe56b` publicado. Build nativo6GiB exit0; imagens app/worker/scheduler amd64 e revision conferidas. Sete migrations0220–0226 aplicadas atomicamente, COMMIT/exit0, RLS ativa e oito RPCs sem EXECUTE anon/authenticated. Atualização somente dos três serviços próprios com override de release, exit0; todos healthy e zero reinícios. IDs de Caddy/WAHA/SRH/Redis preservados.

Health HTTPS às03:08:06UTC: `healthy`, version90456dec, Supabase/Redis/WAHA ok. LoginHTTP200, login real com preenchimento salvo e navegação autenticada inbox/conexões confirmados no Chrome. Nenhuma mensagem enviada, agente criado ou atendimento liberado durante a validação.

Limites e pendências: canal consta **Caiu**, modo teste sem destinatários autorizados; reconexão requer acompanhamento do usuário. Health do serviço WAHA não equivale a sessão de WhatsApp conectada. Chrome alertou senha salva presente em vazamento; usuário orientado a trocá-la. Login conserva verde da configuração atual, sem prova de redesign roxo global em produção. Versão comercial da sidebar ainda1.17.0; imagens e health identificam precisamente90456dec. Não afirmar zero bugs ou execução de testes globais.

Procedência, IDs das imagens, comando aplicado e rollback registrados na VPS em `/opt/zapfloo/releases/90456dec/RELEASE.md`. Recuperação preservada em `/root/zapfloo-recovery-90456dec-bqzuseeh`; não é backup externo. Fonte/código não enviados ao GitHub. Contêineres locais de testes ficaram parados, volumes preservados.

Autorização: usuário pediu concluir onboarding, revisar banco, executar gates completos, preparar alternativa ao GitHub pago e publicar após validação. Backup externo do código ficou a cargo do usuário. Isto não dispensa proteção de recuperação antes de alterar produção.

Base local: `f6842739`, branch `codex/onboarding-roxo`, árvore limpa no início. Sem push/Actions, plano pago ou mudança de visibilidade. Não abrir `.env*`; não enviar mensagens reais ou ativar atendimento de contatos como parte dos testes.

## Estado

As entradas abaixo são um histórico cronológico: marcos posteriores substituem pendências anteriores, sem transformar testes focados em aprovação global.

- `pnpm gov:verify` da base: exit 1, 712 arquivos verdes, um falhou; 7648 testes passaram, quatro falharam nos vínculos de evidência. Log `/tmp/zapfloo-publicacao-baseline-gov.log`.
- Lint da base: zero erros,313 avisos existentes; portanto não descrever como saída sem avisos. Verificação final deve distinguir avisos herdados de novos e resolver os novos no escopo alterado.
- Identificadas quatro falhas no gate de evidências após o checkpoint: citações incompletas e imagens sem citação individual. Investigar e corrigir os documentos, sem remover o gate.
- Supabase local retomado (exit 0) dos volumes do projeto `zapfloo-onboarding-e2e` em `/tmp/zapfloo-onboarding-e2e.KooVaP`. Configuração existente é Postgres 17; teste de invariantes usa separadamente o piso pg15.
- Tipos regenerados para comparação com schemas `public,graphql_public`: 28 linhas adicionadas, somente restauração do schema GraphQL omitido pela geração anterior.
- Mapeamento somente leitura de conexão/autorização em paralelo. Nenhuma implementação de fluxo iniciada ainda.
- Correção dos vínculos em3773dd6f: gate `evidencia-citada` exit0, 47/47; typecheck exit0. Capturas sintéticas reinspecionadas e versionadas. Não substitui repetição final do gov.
- `pnpm test:shell`: exit0, todos os validadores passaram; `/tmp/zapfloo-publicacao-shell.log`. Sem mudanças no kit nesta rodada.
- Continuação agora em implementação conforme `docs/superpowers/plans/2026-09-08-fechar-primeiro-acesso.md`: primeiro contrato transacional, depois UI revisada.
- Reconciliação adicional identificou `storage` também omitido na geração antiga; geração final deve preservar `public,graphql_public,storage`. As tabelas adicionais de catálogo/tarefas/anúncios já constam do baseline; eram tipos defasados.
- Conferência estática das0220–0223: texto integral das quatro migrations presente no baseline; timestamps e nomes presentes em colunas separadas do MANIFEST. Busca pelo filename inteiro não é instrumento válido para esse formato.
- Publicação: HTTPS/login atual200; SSH conhecido22/2222 sem resposta. Projeto público do site é `oedsleckaokqxpzpgwvz`, diferente do único listado no MCP (`jmuxxanlafkrewwkakkb`); nenhum banco remoto foi alterado. Procedimento sem Actions pago documentado em `docs/runbooks/zapfloo-publicacao-local.md`, ainda não executado.
- Saúde pública consultada em2026-09-08T21:41:36Z: versão1.17.0, `healthy`, Supabase/Redis/WAHA `ok`. A rota faz probes de conectividade, não envia mensagens; isto não prova a jornada autenticada nem substitui inspeção da VPS e do schema correto.
- Task1 emcc78d057: DBcompleto1319 passes+1skip, unit8/8 e DBfocado18/18, tipos/lint/mapa verdes. Revisão independente encontrou gate SQLNULL, resolução incompleta de credencial e retry sem conferir snapshot. Não liberar com base nessa primeira bateria.
- Correção focada reproduziu os achados em RED e chegou a unit9/9+DB32/32 verdes, com install/update, typecheck/lint/mapa verdes. Logs `/tmp/onboarding-roxo-review-unit-final.log` e `/tmp/onboarding-roxo-review-db-final.log` conferidos. Aguarda commit e re-review do delta; UI final e gates globais continuam pendentes.
- Task1 liberada após re-review: delta88673337 e documentação4e89e802. Task2 em implementação sobre essa base. Campo extra inerte no recibo não é defeito de autorização; conferência cobre campos canônicos e hash, com redação ajustada.
- `get_project(oedsleckaokqxpzpgwvz)` somente leitura foi recusado com falta de permissão pela conexão Supabase atual. Bloqueio de acesso confirmado; não tentar aplicar no projeto antigo nem contornar a conta conectada.
- Retomada: Task2 implementada e ainda sem commit final. A jornada focada anterior passou6/6 (`/tmp/task2-e2e-delivery.log`), mas a revisão do implementador encontrou sobrescrita de política por outra aba. Correção em validação exige revisão observada desde o GET e escrita condicional no PATCH; a passagem anterior não encerra esse achado.
- Nova tentativa SSH2222 na retomada: timeout, exit255, sem autenticação. Publicação continua bloqueada por acesso; o trabalho local prossegue.
- Inspeção visual do controlador: a captura `evidence/onboarding-jornada/agente-pt-BR-desktop.png` demonstra o formulário/resumo/ensaio local, mas usa a marca padrão da fixture. Não comprova a marca Zapfloo nem sua paleta em produção.

## Pendências de saída

Escopo reduzido por autorização explícita posterior: sem repetição dos gates globais; publicação controlada depende dos testes essenciais e acesso/recuperação. Task2 commit `1fa32bb265e78ad7090709de6a76d1b7b8bf42fc` aprovada na revisão essencial independente, sem bloqueadores no delta. Logs finais CAS unidade8/8, DB6/6, jornada PT/ES2/2 (`/tmp/task2-access-cas-e2e-jornada-final.log`), build/typecheck/lint exit0. Não houve envio real. A lista histórica abaixo deve ser lida com esse recorte.

Console Hostinger acessível pela UI na última checagem: `/opt/zapfloo`, sete contêineres (`caddy`, `scheduler`, `worker`, `app`, `waha`, `srh`, `redis`), três imagens próprias1.17.0. SSH22/2222 escutando; UFW ativo permite22/2222/80/443. `fail2ban-client` ausente. Após diagnóstico, console voltou a pedir login; solicitado ao usuário autenticar sem compartilhar senha. Nenhuma alteração remota realizada.

### Retomada operacional

Usuário autenticou no console. Diagnóstico provou `BindIPv6Only=ipv6-only` com override antigo que substituía as escutas por portas sem endereço: nenhuma escuta IPv4. Após aprovação específica, criado **somente** `/etc/systemd/system/ssh.socket.d/91-zapfloo-ipv4.conf`, com escutas explícitas IPv4/IPv6 nas portas22/2222. Executados daemon-reload e restart apenas do socket; estado ativo e `ss -4` confirmados. Firewall, chaves, autenticação, contêineres e VPS não foram reiniciados/alterados. Reversão possível removendo esse novo override e recarregando o socket; arquivo90 original preservado.

Uma conexão chegou à autenticação, porém a chave v2 requer passphrase e o ssh-agent está vazio. Chave temporária original possui fingerprint autorizado e não requer passphrase; tentativas posteriores ainda terminaram em timeout, com uma captura restrita sem pacotes chegando. Não declarar acesso SSH funcional ainda nem alterar proteções adicionais.

Candidato exportado com git archive de `90456decfb2c9b3e4d19154db81f6492bf4fe56b` para `/Users/juansanches/.codex/zapfloo-release.HjFmGB`, sem arquivos de segredo não versionados. Imagens locais worker/scheduler `:90456dec` construídas com exit0 e arquitetura amd64/revision confirmadas. App em construção (`/tmp/zapfloo-app-90456dec-build.log`), não é resultado concluído. Nenhuma imagem transferida/publicada; banco remoto intacto.

SSH autenticado com a chave temporária original; conexão reutilizável estabelecida na porta22. Configuração operacional confirmada: `/opt/zapfloo/docker-compose.prod.yml`, proxy Caddy separado, sem mounts no app. Banco acessado pela credencial de runtime consumida em memória, sem abrir `.env`: projeto correto, usuário postgres; `supabase_migrations.schema_migrations` inexistente. Consulta somente leitura confirmou `onboarding_drafts` ausente e `channel_session_id` ainda obrigatório: objetos0220–0226 não aplicados.

Recuperação criada em `/root/zapfloo-recovery-90456dec-bqzuseeh` com acesso restrito: `database.dump`1079034bytes (SHA256 `fb5370a3acb00b7c47ce5e8b4f4908a544878ac51cd0abddc2b31e384c05c96c`), imagens anteriores537521664bytes (SHA256 `aec7b837bbc7db2c10256ecc0f70bf70c7605d7105c70bb5f001fc1969350f1c`), compose e Caddyfile. Dump inclui public/auth/storage; catálogo pg_restore legível, sem restauração executada. Não inclui objetos binários do Storage nem promete backup fora da VPS. Nenhum arquivo antigo removido.

Sete SQLs do SHA candidato transferidos para `/opt/zapfloo/releases/90456dec/migrations`, hashes local/remoto conferidos7/7; ainda não executados neste marco. Override de imagens em `releases/90456dec/docker-compose.release.yml`, `docker compose config --quiet` exit0; altera somente imagens próprias/pull_policy. Compilação amd64 do app continua ativa, sem suites globais adicionais.

Build local do app falhou por `ResourceExhausted: cannot allocate memory` depois de compilar, durante TypeScript (exit1). Não é build verde. Dez contêineres locais de teste `zapfloo-onboarding-e2e` foram parados para liberar memória, sem remover volumes e sem parar Docker globalmente. Worker/agendador foram transferidos e carregados na VPS; checksum do pacote `bba60bb92d285177bc89f8b2400119757abbd906fdff3501c601141c7bcf3852` confirmado.

Estratégia operacional alterada para build nativo do app na própria VPS, sem alterar código: fonte `git archive` do mesmo SHA, checksum `55ef45952f39e9b164422a90bd7ec4760b1f5b36816b1029964135a685d3d8bb`, extraída no diretório dedicado de release, `.dockerignore` exclui env. Builder existente legado (depreciado, sem instalar buildx), limites5GiB RAM/6GiB RAM+swap/1,5CPU. Log `/opt/zapfloo/releases/90456dec/app-build.log`. Health público permaneceu1.17.0/healthy durante a preparação. Nenhuma migration ou troca de serviço executada neste marco.

Build nativo com5GiB compilou em4,2min, mas falhou na etapa TypeScript: `State.OOMKilled=true`, confirmado também pelo kernel. Segunda tentativa nativa com6GiB RAM/8GiB RAM+swap, mantendo1,5CPU e o mesmo código, em `app-build-6g.log`. Não confundir falha de recursos com falha de testes; banco e serviços ainda intactos.

1. Vínculos de evidências corrigidos e gate focado verde; repetir no candidato final.
2. Concluir jornada aprovada em `2026-09-08-primeiro-acesso-roxo.md`, preservando separação entre ensaio, conexão e ativação.
3. Reconciliar tipos gerados e validar migrations no banco local.
4. Executar testes completos no candidato estável, build, E2E/visual e imagens amd64.
5. Preparar procedimento privado sem Actions pago, com procedência, imagens imutáveis e rollback; não tratar exceção local como release oficial do upstream.
6. Conferir estado real e recuperação da VPS antes de atualizar. Não declarar publicado antes de confirmar domínio e fluxos.

## Índice de evidências anteriores

As capturas sintéticas já versionadas `evidence/onboarding/estrutura-desktop.png` e `evidence/onboarding/estrutura-celular.png` documentam a estrutura responsiva inicial. `evidence/onboarding/explorar-desktop.png` e `evidence/onboarding/explorar-celular.png` documentam a saída de exploração. São evidências dos lotes anteriores, não prova de que a jornada final ou a produção já foram validadas.
