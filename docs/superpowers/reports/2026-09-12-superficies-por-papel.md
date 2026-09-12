# Superfícies por papel — 12/09/2026

## Resultado

Branch `codex/superficies-por-papel`. A autorização foi fechada de dentro para
fora: RLS/PostgREST, APIs e Server Actions, páginas por URL e, por último,
navegação. Administrador da organização continua sendo um papel do tenant;
administrador da plataforma é uma autoridade transversal distinta.

| CONCLUÍDO E TESTADO | PENDENTE | BLOQUEADO |
|---|---|---|
| Credenciais de IA e tokens de API exigem administrador da plataforma na RLS, API, página e navegação. Os quatro papéis tenant (`viewer`, `agent`, `manager`, `admin`) receberam controles negativos; administrador da plataforma recebeu controles positivos com MFA. | Revisão do PR e execução dos cinco checks remotos depois que a branch for aberta para integração. | Nenhum bloqueio de código conhecido nesta entrega. A suíte completa de E2E não foi executada localmente; a prova de navegador ficou nas três specs tocadas. |
| A anon key não lê nem grava `ai_provider_credentials`, a view segura ou `api_tokens`. O `service_role` continua sendo o caminho interno confiável usado pelo runtime. | Validar em ambiente de homologação a política com integrações externas reais antes de publicar uma próxima versão. | O build padrão do Turbopack não aceita o `node_modules` por symlink deste worktree; o build equivalente suportado pelo Next com Webpack terminou verde. |
| Roteadores somem de sidebar, hub e busca com um agente ativo e aparecem com dois. A URL direta continua legítima e acessível nos dois estados. | — | — |
| Webhooks continuam disponíveis conforme a matriz tenant existente; nenhum guard ou policy deles foi alterado. | — | — |
| Caminhos alternativos foram fechados: criação/edição de agente não permite ao tenant trocar `credential_id`; provedores preservam o vínculo existente; conhecimento mostra falha configurável sem expor a credencial; onboarding usa o fallback da instalação. | — | — |

## Provas finais

| Camada | Medição |
|---|---|
| TypeScript | `corepack pnpm typecheck`: exit 0. |
| ESLint | `corepack pnpm lint`: exit 0, 0 erros e 307 avisos de dívida existente. |
| Unitários | `corepack pnpm test:unit`: 763 arquivos e 7.948 testes verdes. |
| Banco/PostgREST | `corepack pnpm test:db`: baseline em instalação e reaplicação verdes; 167 arquivos, 1.395 testes verdes e 1 ignorado preexistente. |
| Navegador | Chromium real contra Supabase local com o baseline atual: `rbac-roles`, `credenciais-de-ia` e `wizard-do-funcionario`, 16 de 16 casos verdes. |
| Build | Next 16 com `--webpack`: exit 0. O comando padrão via Turbopack foi impedido pelo symlink de dependências do worktree, não por erro da aplicação. |
| Canais e papéis | `corepack pnpm lint:channels` e `corepack pnpm lint:role-rank`: exit 0, sem dívida nova. |
| Release | `corepack pnpm release:conferir`: exit 0; fragmento visível reconhecido. |

## Sabotagens executadas

Cada proteção nova foi retirada isoladamente e precisou produzir vermelho antes
de ser restaurada:

| Proteção sabotada | Vermelho observado |
|---|---|
| `platformOnly` de uma rota de credenciais | O gate estático encontrou apenas uma das duas ocorrências esperadas. |
| Redirecionamento da página restrita | O gate de superfícies detectou a URL direta sem proteção. |
| `minimumActiveAgents` dos roteadores | O teste de navegação passou a mostrar a porta com um agente. |
| Validação de `credential_id` nos agentes | Dois testes permitiram a troca indevida pelo tenant. |
| Guard central `requireRole(..., { platformOnly: true })` | Os quatro papéis tenant atravessaram o controle negativo. |
| Policies RLS de credenciais e tokens | 16 controles por papel e o invariante anti-RBAC reprovaram. |
| Proteção de `base_url` no banco | O tenant voltou a conseguir apontar a chave da plataforma para um endereço próprio. |
| Seleção segura ao trocar provedor | A troca de provedor voltou a preservar uma credencial incompatível. |
| Catálogo utilizável no onboarding | O ensaio voltou a oferecer um modelo sem credencial gerenciada disponível. |
| Chamada em endereço próprio | A ausência da credencial explícita voltou a cair na chave global da instalação. |

Depois das restaurações, os testes focados das três últimas proteções terminaram
25/25 verdes; a suíte unitária completa ficou 763/763 arquivos verde e a suíte
de banco completa voltou a 167/167 arquivos verdes.

## Continuidade dos caminhos legítimos

- O runtime continua resolvendo a chave da plataforma por `service_role` e pelo
  fallback de ambiente já existente.
- O tenant pode alterar modelo e propósito sem receber nem apagar o
  `credential_id` vinculado; ao trocar de provedor, o servidor escolhe uma
  credencial gerenciada compatível.
- O onboarding não pede chave própria e não chama a action legada; a action
  permanece protegida caso seja invocada diretamente. O catálogo do ensaio só
  oferece provedores que a instalação consegue executar.
- Agentes existentes mantêm a credencial atual; novos agentes tenant só podem
  usar a seleção automática (`null`).
- Endereço próprio de provedor é uma configuração exclusiva da plataforma e
  nunca recebe a chave global quando sua credencial explícita está ausente.
- Webhooks não foram restringidos.

## Tripla de schema

- Migration: `supabase/migrations/20260912140000_0230_credenciais_e_tokens_so_da_plataforma.sql`.
- Apêndice idempotente equivalente em `supabase/baseline.sql`, antes da
  varredura anon final.
- Linha correspondente em `supabase/migrations/MANIFEST.md`.

O teste de banco aplicou o baseline como instalação fresca e o reaplicou como
atualização, ambos sem erro.

## Living System Checklist

- **Quem alimenta:** identidade autenticada, organização ativa,
  `is_platform_admin` e contagem de agentes ativos não arquivados.
- **Quem eu alimento:** RLS/PostgREST, handlers, Server Actions, páginas, hubs,
  sidebar e busca global.
- **Atividade/log:** recusas do guard central geram `authz.denied` com motivo
  `platform_admin_required`; a policy de banco falha fechada sem registrar
  segredo ou dado pessoal.
- **Onde aparece:** Credenciais de IA e Tokens de API aparecem somente para a
  plataforma; Roteadores aparece quando há decisão de distribuição a fazer.
- **Porta:** os destinos continuam declarados no registro canônico de
  navegação; `platformOnly` é autorização e `minimumActiveAgents` é somente
  relevância visual.
- **Anti-morte:** falta de chave é exibida como indisponibilidade acionável, sem
  formulário impossível para o tenant; vínculo técnico existente é preservado.
- **Onde configura:** a equipe da plataforma mantém credenciais e tokens nas
  páginas reservadas; o tenant continua configurando os aspectos comerciais do
  agente e dos webhooks.
- **Continuidade IA↔humano:** o runtime continua via `service_role` e fallback
  da instalação; nenhuma conversa depende de o tenant ter acesso à chave.
- **Laço de retorno:** testes de UI, API e banco ficam vermelhos quando qualquer
  guard é removido; recusas de API também entram na auditoria.
- **Mapa vivo:** não surgiu serviço ou fila nova; a matriz vigente foi atualizada
  em `docs/business-rules/papeis-e-telas.md`.

## O QUE NÃO FOI MEDIDO

- Não foi consultado o inventário real de usuários ou organizações da produção.
- Não houve deploy, acesso à VPS, merge na `main` nem abertura de PR.
- Não foi executada a suíte E2E inteira; somente as três specs diretamente
  afetadas, com 16 casos em Chromium.
- Firefox, WebKit, aparelhos físicos e largura móvel não foram medidos nesta
  entrega de autorização.
- Nenhuma API externa, provedor de IA ou envio de WhatsApp foi acionado.
- O build padrão do Turbopack não foi provado neste worktree por causa do symlink
  de `node_modules`; o build suportado com Webpack foi o que terminou verde.
