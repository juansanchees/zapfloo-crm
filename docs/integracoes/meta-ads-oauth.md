# Conexão de anúncios com Facebook e link de autorização

## Uso

Em **Configurações → Meta Ads** (`/app/settings/meta-ads`), quem tem papel
`manager`, `admin` ou administração de plataforma pode iniciar **Conectar com
Facebook**. Depois do consentimento, escolhe uma das contas devolvidas pela
autorização como conta padrão. A leitura de campanhas continua em
**Análise → Meta Ads** (`/app/ads/meta`). Esta conexão não cria, altera ou pausa
campanhas e não substitui a integração de conversões.

O cliente usa **Gerar link de conexão**, copia o endereço e o envia à agência
ou à pessoa que administra sua conta de anúncios. O destinatário não precisa de
usuário ou sessão no CRM. A página pública mostra somente o nome do negócio
autorizado e o botão **Conectar com Facebook**. O consentimento e as senhas são
tratados pelo Facebook; o CRM não pede a senha do cliente.

O link tem uso único e validade de 30 minutos. Abrir, recarregar ou pré-carregar
a página não o consome. O POST do botão consome o link antes de abrir o
consentimento e cria uma sessão OAuth separada, válida por 10 minutos. Depois de
cancelamento, erro, expiração ou uso anterior, gere outro link. A página de
resultado é genérica e não dá acesso ao CRM ou a dados da organização.

Aplicação e banco podem ter relógios diferentes. O prazo assinado é o menor
entre o vencimento do recibo e a janela contada pela aplicação **antes** da
RPC. A resposta e a auditoria mostram esse prazo efetivo. A assinatura não
prolonga o recibo, a latência não renova a janela e o banco mantém sua própria
checagem de expiração. Não se adiciona tolerância ao verificador de assinatura.

## Configuração opcional da instalação

O caminho manual existente continua disponível para `admin` quando OAuth não
está configurado; o visitante do link recebe indisponibilidade genérica. Nenhum
segredo ou identificador real de aplicativo pertence a este documento.

| Variável | Origem e uso |
|---|---|
| `META_APP_ID` | Identificador do aplicativo da instalação no Meta for Developers. |
| `META_APP_SECRET` | Segredo do aplicativo, somente no servidor. É compartilhado com a integração oficial do WhatsApp que já usa esta variável; não substituir ou rotacionar sem coordenar os dois consumidores. |
| `META_LOGIN_CONFIG_ID` | Identificador da configuração do Facebook Login for Business que oferece a permissão de leitura. |
| `META_GRAPH_VERSION` | Versão explícita da Graph API; o resolvedor em `oauth/config.ts` declara o padrão suportado. |
| `NEXT_PUBLIC_APP_URL` | Origem HTTPS canônica da instalação. Define o retorno; não vem do `Host`, do visitante ou do corpo da requisição. |
| `INTERNAL_SECRET` | Segredo existente da instalação, com pelo menos 32 caracteres, usado para assinar o link e o `state`; não é entregue ao navegador. |

No aplicativo do Facebook, registre o retorno exato:
`<NEXT_PUBLIC_APP_URL>/api/v1/ads/meta/oauth/callback`.

Configure o Facebook Login for Business para autorizar `ads_read`. O cliente
de consentimento usa `config_id`, sem acrescentar uma lista paralela de escopos
na URL. Não se exige `business_management` automaticamente: a necessidade de
permissões e revisão para uma conta real deve ser verificada para o aplicativo
e os ativos que ele realmente acessará. Não foi medida nesta entrega uma
aprovação de aplicativo ou de conta real.

Referências primárias: [Facebook Login for Business](https://developers.facebook.com/docs/facebook-login/facebook-login-for-business/),
[fluxo manual de autorização](https://developers.facebook.com/documentation/facebook-login/guides/advanced/manual-flow),
[autorização da Marketing API](https://developers.facebook.com/documentation/ads-commerce/marketing-api/get-started/authorization)
e [Insights](https://developers.facebook.com/docs/marketing-api/insights/).

## Autoridade, isolamento e revogação

- A organização é resolvida da sessão autenticada ao emitir o link ou começar
  o consentimento direto. A página pública resolve o escopo somente depois de
  validar a assinatura e o recibo persistido; não aceita `organization_id` do
  visitante. O link contém identificador aleatório da solicitação e prazos,
  sem ID de organização ou de usuário.
- O `state` de callback é assinado, de outra finalidade, e ligado a uma sessão
  de uso único em `ad_insights_oauth_requests`. Um cookie HttpOnly SameSite=Lax
  vincula o navegador que iniciou àquele que voltou. A sessão é consumida antes
  da troca do código por token. Reuso, assinatura errada, prazo vencido ou
  navegador diferente não podem gravar a conexão.
- A permissão atual de quem emitiu é reconferida; remoção da organização ou
  revogação do papel não preserva autoridade no link antigo. O banco serializa
  início, consumo, conclusão e desconexão por organização. A desconexão revoga
  solicitações pendentes, para um callback antigo não recriar o acesso.
- `ad_insights_oauth_requests` tem RLS e grants revogados de `public`, `anon` e
  `authenticated`. As RPCs de estado são `security invoker`, concedidas apenas
  a `service_role`; parâmetros de organização são resolvidos pelo servidor.
  A migration 0235, o apêndice idempotente do baseline e o MANIFEST andam juntos.
  O apêndice termina notificando o PostgREST para recarregar o schema após as
  funções novas; não depende de uma notificação anterior no arquivo.
- O token de anúncios continua cifrado em `ad_insights_connections`. A UI lê
  presença, conta padrão e metadados de validade; não recebe o token guardado.
  A seleção de conta é validada contra as contas alcançadas pela autorização.
- As únicas APIs públicas novas são `POST /api/v1/ads/meta/oauth/agency` e
  `GET /api/v1/ads/meta/oauth/callback`. Os caminhos autenticados de conexão e
  emissão de links não ganham exceção por prefixo. As páginas públicas usam
  `noindex`, renderização dinâmica e não consultam sessão para escolher idioma.
  Seu nome vem somente do recibo validado. A página do formulário usa
  `strict-origin`: o `Referer` leva apenas a origem, nunca o caminho com a
  capacidade, e o POST mantém o `Origin` necessário à proteção contra CSRF.
  O mesmo valor é enviado no header HTTP específico de `/ads/connect/:path*`,
  antes de qualquer corpo ou metadata transmitida em streaming; a regra geral
  das demais páginas não muda.
  Resultado e endpoints OAuth têm regras HTTP específicas `no-referrer`,
  além dos headers das rotas. A prova de rede mostrou que a regra global
  sobrescrevia o header do redirecionamento; as exceções são posteriores a ela.
  O navegador demonstrou que `no-referrer` na página do formulário produzia
  `Origin: null`; a guarda continuou recusando essa origem, não foi afrouxada.
  Contratos: [Fetch — Origin](https://fetch.spec.whatwg.org/#append-a-request-origin-header)
  e [Referrer Policy — strict-origin](https://www.w3.org/TR/referrer-policy/#referrer-policy-strict-origin).
- O redator compartilhado `lib/sentry/scrub.ts` remove a capacidade de
  `/ads/connect/[token]` de erros, spans, transações e breadcrumbs, inclusive
  `data.from`/`data.to` emitidos pela navegação real do SDK e URLs em mensagens
  de exceção; o corpo do
  POST público também é omitido se a instrumentação o capturar. A página de
  resultado genérico permanece identificável. O transporte de token suprime
  instrumentação com o SDK real, além de não registrar URLs ou erros brutos.
- A lista de contas reaproveita o transporte de leitura existente. A paginação
  agora restringe o destino HTTPS, remove credenciais da query e recusa
  redirecionamentos. O orçamento de 20 segundos inclui todas as páginas e a
  leitura do corpo; o cliente espera 30 segundos, sem repetir a mutação.

### Exceção delimitada: parâmetros sensíveis na chamada servidor → Facebook

O dono autorizou a exceção necessária ao contrato GET documentado para troca
de código e inspeção de token. Código, segredo de aplicativo e tokens podem
aparecer em parâmetros **somente da requisição HTTPS entre o servidor e os
endpoints fixos do Facebook**. Não são URLs de navegação, não são resposta ao
cliente e não podem ir a logs, erros, Sentry, screenshots ou relatórios. O
endereço de retorno e os endpoints não são escolhidos pelo visitante. Esta
exceção não autoriza bearer em query de nenhuma API interna do CRM.

## Prazo real e recuperação

Os prazos vêm da resposta e inspeção do provedor: `token_expires_at`,
`data_access_expires_at`, `token_type` e `token_checked_at`. O primeiro dos dois
prazos conhecidos limita a conexão. O aviso de **até 7 dias** usa o relógio
atual; prazo vencido pede reconexão. O cliente OAuth recusa inspeções sem os
campos de prazo: ausência não significa autorização permanente. Zero explícito
do provedor é armazenado como `null`, sem inventar “60 dias”. Na interface,
metadados nulos, inclusive de conexões legadas, indicam validade desconhecida.
Conexões legadas seguem utilizáveis, sem uma data estimada apresentada como real.

A troca de token curto por longo depende do tipo de token real. O resultado
precisa ser inspecionado novamente antes de ser guardado; receber uma resposta
de troca não significa validade fixa garantida. Referências:
[debug_token](https://developers.facebook.com/docs/graph-api/reference/debug_token/)
e [tokens de longa duração](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/).

## Retenção dos recibos

O cron existente `/api/v1/cron/data-retention` chama
`fn_ad_insights_oauth_expurgar` e registra a contagem `ads_oauth_apagados` na
auditoria da retenção. A função só remove recibos expirados há pelo menos um
dia, em lotes de no máximo 1.000. Remove primeiro sessões-filhas e só depois
links-pais, preservando o prazo de cada recibo e a contagem efetivamente
removida; não usa uma cascata invisível na contagem. Não há cron novo ou limpeza
manual exigida de quem opera a VPS.

## Living System Checklist

| Pergunta | Artefato concreto |
|---|---|
| Quem alimenta? | `/app/settings/meta-ads` resolve organização/papel e inicia consentimento ou emite o link. O POST da página pública inicia a autorização delegada. |
| Quem recebe? | `ad_insights_connections` alimenta `ads/meta/accounts`, `ads/meta/campaigns` e a tabela em `/app/ads/meta`. |
| Que atividade emite e onde aparece? | `audit()` grava o ciclo de autorização em `api_audit_log`; `/app/audit` exibe as ações. A retenção existente registra `ads_oauth_apagados`. A tela de configuração e o resultado público exibem o desfecho sem credencial. |
| Qual a porta? | Entrada existente `meta-ads` em `lib/navigation/registry.ts`; o botão de gerar link entrega a URL pública, que não é uma tela do menu do destinatário. |
| Qual o anti-morte? | Falha/cancelamento público pede novo link; configuração indisponível mantém o caminho manual para admin; falha na lista permite tentar novamente; validade conhecida vencida ou próxima do vencimento aponta para reconectar. |
| Onde configura? | Configuração do aplicativo no ambiente da instalação, disponibilidade resolvida por `oauth/config.ts`; autorização, conta padrão, modo manual e desconexão em `/app/settings/meta-ads`. |
| Continuidade IA↔humano? | Não há turno de IA ou decisão sobre leads nesta autorização. Uma pessoa autoriza a leitura, e os dados passam a apoiar a decisão humana em Análise. |
| Qual o retorno? | Erro ou revogação invalida a tentativa atual e exige autorização nova; a escolha de conta muda as leituras seguintes. Os prazos reais alteram o aviso de reconexão. Nenhuma promessa de renovação automática. |
| Mapa vivo? | `docs/architecture/meta-ads-oauth.architecture.json`, com entradas/saídas do link, consentimento, recibo, conexão e tela de análise. |

## Evidência e limites

Os testes de módulo, as provas de banco, o e2e com provedor controlado e as
sabotagens são registros distintos; nenhum deles, sozinho, equivale a
consentimento real no Facebook. Evidências locais ficam em
`.superpowers/evidence/meta-ads-oauth/`.

| Camada | Medição local em 15/set/2026 |
|---|---|
| Tipos e lint da camada pública/rotas | `corepack pnpm typecheck` terminou com exit 0 (`typecheck-publico-rotas.log`); ESLint de `app/ads/connect`, `lib/auth/public-paths.ts` e dos dois testes de rotas/serviço terminou com exit 0. |
| Páginas públicas e mapa | 141 testes passaram em `app/ads/connect/public-pages.test.tsx` e `tests/unit/mapas-de-arquitetura.test.ts`. O mapa é guarda estrutural, não prova de consentimento. |
| Rotas e serviço | 42 testes passaram em `tests/unit/meta-ads-oauth-rotas.test.ts` e `tests/unit/meta-ads-oauth-servico.test.ts`: assinatura HMAC real, cookie, recibo de consumo, autorização atual, escopo e saída sem token; banco/provedor controlados. |
| Configuração, estado, cliente e telemetria | 67 testes passaram; `oauth-unit-restaurado.log`. HMAC, prazo, `app_id` e supressão de telemetria foram removidos separadamente: 1, 1, 2 e 1 falhas, respectivamente, nos logs `oauth-sabotagem-*.log`; guards restaurados. |
| Conexão manual e escolha de conta | 55 testes passaram em `tests/unit/meta-ads-conexao-manual-conta.test.ts`, com `requireRole` real; Auth e IO controlados. O PATCH de 12 segundos chegou à tela com uma só chamada do cliente HTTP real; restaurado `16 passed` em `timeout-patch-restaurado.log`. |
| Retenção e sigilo do link | `20 passed` em `retencao-restaurado.log`; retirada do relógio ou do registro de efeito produziu 1 falha cada. Path/body: uma falha por sabotagem e 12 testes restaurados. Navegação/exceções: `16 passed` em `sentry-navegacao-restaurado.log` (scrub + transporte); retirada dos redatores produziu 2 falhas. O SDK Browser real emitiu `from: /ads/connect/[TOKEN]` após o conserto. |
| Relógios independentes | `54 passed` em `clock-restaurado.log` (serviço + assinatura): banco +1 ms, +32 s e -32 s, limite exato e latência sem renovar prazo. Retirar o limite produziu 7 falhas; voltar à igualdade exata com o recibo produziu 3. Nenhum relógio ou verificador foi afrouxado. |
| Formulário público e política de referência | O POST nativo com `no-referrer` produziu `Origin: null`, resposta 403 e nenhuma chamada Graph (`e2e-agencia-origin403-direto.log`). Corrigidos apenas metadata/header, sem aceitar origem nula. `15 passed` em `referrer-restaurado.log`; retirar metadata ou header específico produziu uma falha cada, depois restaurados. |
| Headers privados do OAuth | A regra global sobrescrevia o header privado do 303: a navegação externa recebia apenas a origem, não o caminho da capacidade. As exceções explícitas do OAuth/resultado mantêm `no-referrer` também na configuração do Next. `17 passed` em `referrer-excecoes-restaurado.log`; retirada das duas exceções produziu `2 failed`, seguida de restauração verde. |
| Verificação geral | `corepack pnpm gov:verify --maxWorkers=3`: exit 0, 789 arquivos e 8.340 testes aprovados (`gov-verify-arvore-final.log`). Typecheck, lint (308 avisos, nenhum erro), canais e papéis aprovados. |
| Banco | `corepack pnpm test:db`, um worker: exit 0, 173 arquivos, 1.440 testes aprovados, um skip preexistente; INSTALL e UPDATE aprovados (`db-completo-notify-final.log`). As 13 sabotagens de comportamento do banco e a retirada do NOTIFY produziram falhas reais; recibos, papéis, replay, expiração, isolamento, concorrência, grants e retenção foram exercitados em PostgreSQL/PostgREST locais. |
| Jornada Playwright com OAuth | `6 passed`, exit 0, sem retry ou skip (`e2e-com-oauth-drenagem-final.log`): admin e manager conectam e escolhem conta, agência conecta e não reutiliza link, expiração recusa, viewer e agent não acessam a configuração. Auth, RPCs, cifra, PostgreSQL/PostgREST e navegador locais reais; Graph e consentimento simulados. |
| Jornada Playwright sem OAuth | `2 passed (18.8s)`, exit 0 (`e2e-sem-oauth-isolado-final.log`): admin mantém cadastro manual sem autofill; manager não ganha a permissão manual de admin. Botão OAuth ausente nos dois casos. |
| Rede observada no navegador | 129 respostas observadas nas três jornadas positivas: 59 concluídas com corpos efetivamente lidos e verificados, 70 prefetches abortados registrados separadamente, zero pendentes, erros de leitura ou tokens expostos. Os corpos dos endpoints críticos têm controle positivo de presença; aborto não conta como corpo provado. |
| Layout | 22 capturas e medidas em 1280×720 e 390×844, sem transbordo horizontal. `getBoundingClientRect` e `getComputedStyle` registram dimensões, tipografia e alvos de interação. Não é uma prova de todo o produto. |
| Sabotagens de integração das rotas | Ignorar a assinatura, retirar a rejeição do cookie ausente e presumir um recibo válido no lugar do banco produziram, cada um, `1 failed` e exit 1. Logs `rotas-sabotagem-assinatura.log`, `rotas-sabotagem-cookie.log`, `rotas-sabotagem-consumo.log`; restaurado `42 passed` e exit 0 em `rotas-servico-restaurado.log`. O hash do callback voltou ao original. |

As sabotagens foram selecionadas por nome: os `22 skipped` de cada execução
vermelha são os demais casos não selecionados por `-t`, não novos `skip` no
fonte. Assinatura e recibo adulterados fizeram aparecer `status=conectado`
onde o teste exigia `status=erro`; retirar o guarda do cookie fez a RPC receber
`p_browser_digest: null`. A chamada real ao Facebook e o banco real não são
substituídos por estas provas unitárias.

Uma repetição sem OAuth, simultânea ao `gov:verify`, falhou antes da tela-alvo:
o login excedeu cinco segundos esperando a navegação. O trace registrou resposta
200 RSC com `x-action-redirect: /app`, concluindo a decisão de autenticação. Os
mesmos dois casos foram repetidos após o término do gate e passaram, sem mudar
fonte, timeout ou `retries: 0`. Carga concorrente é uma hipótese, não causa
demonstrada. O vermelho está preservado em `e2e-vermelho-login-timeout`.

O harness verifica o POST real, seu 303, destino e cookie; uma ponte somente
de QA transforma o seguimento desse redirect em uma navegação interceptável
pelo Playwright para o consentimento simulado. Isso não mede a tela externa
real. O callback, a volta cross-site, a sessão, o armazenamento e a leitura de
contas percorrem o aplicativo real. A captura CDP drena todas as respostas
observadas até corpo lido, aborto registrado ou erro explícito; não presume
sigilo de um corpo que não conseguiu ler.

**Não medido nesta versão deste registro:** autorização com conta real, revisão
do aplicativo, alcance real de contas/ativos, token real de longa duração e
comportamento de expiração ao longo de dias. Nenhuma produção foi alterada por
estas provas locais.
