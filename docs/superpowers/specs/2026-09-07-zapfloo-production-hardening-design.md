# Spec — Zapfloo: estabilização da instalação própria em produção

**Data:** 2026-09-07
**Responsável:** Codex + Juan Sanches
**Status:** desenho aprovado em conversa; aguardando revisão deste documento
**Base validada:** `v1.16.1` (`c85f7d72eebe33649812fe5cae174b7dd80e0e9f`)
**Repositório próprio:** `juansanchees/zapfloo-crm` (privado)

## 1. Objetivo

Transformar a instalação atual em uma distribuição própria e reproduzível da Zapfloo,
mantendo o Supabase Cloud como serviço externo e a VPS Hostinger como runtime dos
contêineres. A entrega precisa remover os contornos manuais feitos durante a primeira
instalação, provar o fluxo real WhatsApp → agente OpenAI → resposta e deixar atualização,
backup e rollback operáveis.

"100%" nesta spec significa: os critérios de aceite abaixo foram exercitados e passaram.
Não significa ausência absoluta de defeitos futuros.

## 2. Estado confirmado de partida

- Produção publicada em `https://crm.zapfloo.tech`, versão `1.16.1`.
- VPS Hostinger `82.25.79.194`, Ubuntu 26.04, Docker e Compose ativos.
- App, worker, scheduler, Redis, WAHA, Caddy e SRH estão saudáveis.
- O healthcheck externo confirma Supabase, Redis e WAHA como `ok`.
- Supabase externo: projeto `oedsleckaokqxpzpgwvz`, com baseline aplicado e 118
  tabelas no schema `public` na medição de instalação.
- Site URL e redirect de autenticação apontam para `crm.zapfloo.tech`.
- A credencial OpenAI é aceita por `/v1/models`; isso ainda não prova saldo nem geração.
- A organização mais recente, `Petshop da Ale`, foi alinhada para o provider `openai`.
- O repositório local original tinha apenas a alteração do usuário em
  `.codex/config.toml`; ela não faz parte desta entrega.
- O repositório privado preserva histórico, tags, licença e atribuição do upstream.

## 3. Problemas observados que entram no escopo

### P0 — instalação e atendimento principal

1. O instalador falhou na VPS por expansão indevida de texto entre crases dentro de um
   heredoc não protegido.
2. A imagem/default do WAHA usada inicialmente não entregou o engine esperado; a VPS
   ficou operacional com `devlikeapro/waha:noweb-2026.7.2`.
3. A connection string do pooler do Supabase exigiu compatibilidade TLS explícita para
   o cliente do worker (`uselibpqcompat=true`).
4. Organização criada depois da instalação herdou `anthropic`, apesar de a instalação
   ter sido configurada para OpenAI.
5. A interface diagnosticou "falta a chave da IA" sem distinguir provider divergente,
   credencial ausente e falha real de geração.

### P1 — confiabilidade operacional

6. O worker sobe saudável, mas desliga o dreno interno de `event_log` por um erro de
   empacotamento envolvendo `@react-pdf/textkit` e `@react-pdf/hyphenation`; o cron é o
   fallback atual.
7. SMTP customizado e templates de autenticação não estão configurados; o SMTP padrão
   do Supabase não é adequado a produção.
8. Ainda não existe evidência de restore de backup, alerta externo, pareamento real do
   WhatsApp nem resposta real da OpenAI pela jornada completa.

## 4. Decisões aprovadas

| Área | Decisão |
|---|---|
| Propriedade | Repositório independente e privado `juansanchees/zapfloo-crm` |
| Upstream | O projeto original permanece no remote `upstream`; Zapfloo usa `origin` |
| Isolamento | Mudanças na branch/worktree `codex/production-hardening` |
| Banco | Supabase Cloud externo; nenhuma troca para Postgres local na VPS |
| IA | OpenAI como provider padrão desta instalação |
| WhatsApp | WAHA com engine NOWEB e imagem versionada, nunca tag móvel |
| Método | Teste falhando primeiro, correção mínima, teste verde e revisão do diff |
| Publicação | Imagens próprias Zapfloo publicadas pelo CI, não buildadas na VPS |
| Produção | Atualização somente depois dos gates; versão atual preservada para rollback |

## 5. Arquitetura alvo

```text
Internet
  └─ crm.zapfloo.tech
       └─ Caddy :80/:443
            └─ app Zapfloo :3000
                 ├─ Supabase Cloud (DB/Auth/Realtime/Storage)
                 ├─ Redis + SRH (rede Docker privada)
                 ├─ WAHA NOWEB (rede Docker privada)
                 └─ worker + scheduler (imagens Zapfloo versionadas)
                         └─ OpenAI API
```

Nenhuma credencial entra em imagem, log, commit, URL ou relatório. O `.env` da VPS
continua fora do Git e não será aberto; alterações serão feitas por comandos que não
imprimam valores.

## 6. Desenho das correções

### 6.1 Instalador determinístico

- Reproduzir o erro do heredoc em teste shell isolado.
- Remover a possibilidade de command substitution em todo bloco SQL/heredoc afetado.
- Validar instalação nova e reexecução idempotente.
- Incorporar a opção TLS do pooler na criação/normalização da URL sem duplicar query
  params e sem expor a senha.

### 6.2 WAHA compatível e pinado

- Fixar imagem e engine que passaram na VPS amd64.
- Testar a resolução dos defaults do compose e do `.env` gerado.
- Provar healthcheck, criação da sessão, QR, estado `WORKING`, inbound e outbound.
- Manter painel/porta administrativa fora da internet.

### 6.3 Provider de IA coerente

- A preferência escolhida no instalador vira a fonte do seed inicial e dos defaults de
  organizações novas.
- O onboarding não pode sobrescrever silenciosamente uma preferência válida.
- A interface deve separar pelo menos: provider sem credencial, provider diferente do
  configurado, credencial rejeitada e geração sem crédito/indisponível.
- O teste final usa uma geração curta e barata pela própria jornada do produto.

### 6.4 Worker empacotado por superfície

- Criar uma reprodução do import que desliga o dreno de `event_log` na imagem publicada.
- Identificar o primeiro import indevido entre worker e dependências de PDF/UI.
- Cortar o acoplamento ou ajustar o empacotamento sem levar dependências desnecessárias ao
  worker.
- Aceite: worker saudável e dreno interno ligado, sem depender somente do cron.

### 6.5 E-mail de autenticação

- Configurar SMTP transacional escolhido pelo operador no Supabase.
- Ajustar remetente, URLs e templates Zapfloo para confirmação, convite e recuperação.
- Testar entrega real e link retornando ao domínio correto.
- Segredos SMTP serão inseridos pelo usuário no painel ou por canal seguro; nunca no chat.

### 6.6 Operação, segurança e recuperação

- Backup diário do banco e artefatos persistentes, com cópia fora da VPS.
- Restore ensaiado em ambiente isolado; backup não restaurado não conta como proteção.
- CA do Supabase e verificação TLS estrita quando suportada pelo pooler validado.
- SSH por chave, firewall mínimo, logs rotacionados e serviços internos sem porta pública.
- Monitor externo do domínio/healthcheck e captura de erros sem PII/segredos.
- MFA para contas administrativas do GitHub, Supabase, Hostinger e app.

Referências operacionais:

- Supabase SMTP: https://supabase.com/docs/guides/auth/auth-smtp
- Supabase backups: https://supabase.com/docs/guides/platform/backups
- Supabase SSL: https://supabase.com/docs/guides/platform/ssl-enforcement
- GitHub, duplicação de repositório: https://docs.github.com/en/repositories/creating-and-managing-repositories/duplicating-a-repository

## 7. Sequência de entrega

1. Congelar evidências do estado atual e comandos de rollback.
2. Escrever o plano executável com arquivos e testes exatos.
3. Corrigir cada defeito com TDD na branch isolada.
4. Rodar gates locais relevantes, incluindo `test:shell`, unitários, typecheck, lint,
   build das imagens e o teste de banco quando houver impacto em schema/RLS.
5. Abrir PR no repositório privado e exigir os cinco checks do projeto.
6. Publicar imagens Zapfloo com tag imutável pelo GitHub Actions.
7. Fazer backup pré-deploy e atualizar a VPS para essa tag.
8. Executar smoke técnico e jornada visual real.
9. Observar logs/alertas; só então declarar a versão estável.

## 8. Matriz mínima de aceite

| Camada | Prova obrigatória |
|---|---|
| Git | `origin` privado, `upstream` preservado, tags e licença presentes |
| Install | clone fresco, install e reexecução sem erro; `.env` não aparece no log |
| Banco | baseline/migrations compatíveis; RLS/invariantes verdes se tocadas |
| Build | app, worker e scheduler constroem para `linux/amd64` no CI |
| Runtime | todos os contêineres saudáveis e domínio HTTPS responde |
| Auth | cadastro/convite, login, logout e recuperação por e-mail real |
| Tenant | organização nova nasce com OpenAI e isolamento entre tenants |
| WhatsApp | QR real, sessão `WORKING`, mensagem inbound e outbound |
| IA | inbound dispara geração OpenAI real e entrega resposta no WhatsApp |
| Worker | dreno `event_log` ativo, sem erro de `hyphenation` |
| Recuperação | restore isolado comprovado e rollback da aplicação ensaiado |
| Observação | alerta de indisponibilidade e erro rastreável sem dado sensível |

## 9. Rollback

- Registrar digest/tag das imagens atualmente em execução antes do deploy.
- Fazer dump consistente e snapshot dos volumes necessários antes de qualquer migration.
- Se o smoke falhar, restaurar as tags anteriores no compose e recriar somente os serviços
  afetados, preservando volumes.
- Migration destrutiva não faz parte desta fase. Se uma migration aditiva for necessária,
  ela terá migration nova, apêndice idempotente no baseline, MANIFEST e estratégia de
  compatibilidade reversa.
- Restore do banco só será usado quando houver mutação incompatível ou perda de dados;
  rollback de app não deve reverter dados automaticamente.

## 10. Fora de escopo

- Reescrever o produto ou trocar sua stack.
- Migrar dados para outro projeto Supabase sem necessidade comprovada.
- Expor WAHA, Redis, Postgres ou painéis internos na internet.
- Prometer ausência absoluta de bugs.
- Adicionar funcionalidades comerciais novas antes de estabilizar o fluxo existente.

## 11. Informações/ações humanas ainda necessárias

1. Escolher ou confirmar o provedor SMTP e disponibilizar as credenciais por entrada
   segura no painel, nunca por mensagem.
2. Confirmar qual usuário/organização será o dono canônico da Zapfloo; hoje existem
   organizações de teste anteriores.
3. Confirmar faturamento/créditos da OpenAI para a geração real.
4. Escanear o QR com o número definitivo do WhatsApp durante o teste acompanhado.
5. Autorizar, em ação separada, a exclusão da chave OpenAI acidental `Test - Zapfloo`,
   caso ela continue ativa.

## 12. Condição de conclusão

A estabilização só termina quando todos os itens aplicáveis da matriz de aceite têm
evidência recente, o restore foi exercitado e o rollback foi documentado. Saúde de
contêiner e `curl` isolados não provam a experiência completa do usuário.
