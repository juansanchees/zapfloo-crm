# Primeiro acesso — correções da base e lote visual

Data: 2026-09-08. Trabalho local, não publicado.

## Isolamento

Worktree `.worktrees/onboarding-roxo`, branch `codex/onboarding-roxo`, base `22620d85`. Alteração preexistente em `.codex/config.toml` da pasta principal preservada. Node 22, pnpm 9.15.9 e dependências do lockfile.

Somente banco efêmero de invariantes e Supabase local com dados sintéticos. Sem acesso à VPS, mutação do Supabase remoto, mensagens reais, chaves de IA, leitura de segredos de produção, commit ou push.

## Correções verificadas

| Defeito | Evidência e correção |
| --- | --- |
| Multipart Node 24/jsdom no harness | 11 casos falhavam antes da importação; teste usa ambiente Node e construtores coerentes. 14 passam; rota de produção não mudou. |
| Relógio host/banco no follow-up | Teste compara janela do relógio do banco; removida antecipação artificial do próximo tick. |
| Agenda em andamento no histórico | Classificação considera término. 13 testes passam, incluindo fronteiras. |
| STOP ignorava pausa manual | Pausa manual é cancelada por STOP; inbound/handoff não a retomam. 17 testes passam. |
| Onboarding sem admin/MFA | 6 regressões falhavam; helper agora exige guard canônico. 11 casos passam, inclusive convite admin bloqueado sem assinatura. |
| Sugestão de funil aceitava organização externa | dadosDoPasso não recebe mais organização/nome: resolve contexto autorizado na entrada. |
| Convidado preso no wizard | Apenas admin pendente é encaminhado; dois E2Es provam convidado sem ciclo e admin retornando à outra organização. |
| Exceção tardia do harness de colagem | FocusScope agenda evento após desmontar; cleanup local aguarda o timer no mesmo jsdom. Sem alterar Composer ou interceptar erros. |
| Retentativa confundia versão existente com publicada | Três regressões reproduziram ponteiro indevido para draft/archived/superseded. Recuperação agora exige status published; 28 testes da action passam, incluindo recuperação legítima. Revisão independente sem bloqueadores novos. |

## Gates anteriores à moldura

- Unitários após agenda/STOP: 701 arquivos, 7.547 testes, saída 0.
- Banco completo exclusivo: **157 arquivos, 1.244 aprovados, 1 ignorado**, saída 0. Skip de rate limit já existia; não é prova dessa integração.
- Rodada anterior do banco sob concorrência excedeu timeout de um webhook. Arquivo sem alterações passou isoladamente (28 passes, 1 skip), depois suíte exclusiva passou. Nenhum timeout aumentado.
- Typecheck, lint, gates de canais e papéis e build passaram após autorização.
- **9 E2Es da agenda** passaram; imagens desktop/celular inspecionadas. A captura da semana vazia não prova a fronteira de atendimento em andamento; os testes unitários provam essa fronteira.
- **2 E2Es de navegação** passaram após guards, antes da moldura.
- Rodada posterior teve 7.558 asserções aprovadas mas saiu 1 por exceção tardia do Radix. Não foi considerada verde; motivou cleanup explícito.

## Redesign neste lote

Primeira camada de apresentação implementada: OnboardingFrame, painel grafite com detalhe roxo/laranja, progresso canônico, estrutura responsiva e marca pelo provider resolvido (também nas boas-vindas). Formulários e ordem permanecem reais, sem botão fictício de ativação.

**O fluxo completo aprovado ainda NÃO foi implementado.** Dependências:

1. A migration 0220 permite rascunho sem canal no banco local; versões publicadas continuam exigindo canal. A página atual ainda procura versão publicada e a API de criação ainda exige canal. Falta integrar a criação e o ensaio do novo rascunho antes de inverter etapas.
2. Endpoint de ensaio usa runtime legado, marcado deprecated. Não prometer equivalência integral com atendimento nem usar respostas prontas como prova de IA.
3. Explorar CRM foi implementado como preferência individual de sessão por usuário/organização. O banco compartilhado não é alterado; banner permite retomar. A preferência não substitui os guards de admin/MFA/suspensão.
4. Revisão deve corresponder à configuração testada e ser invalidada ao editar. Conexão e autorização restrita continuam separadas.

Contrato: `docs/superpowers/specs/2026-09-08-primeiro-acesso-roxo.md`. Subplano visual: `docs/superpowers/plans/2026-09-08-onboarding-estrutura-visual.md`.

## Gate final

Rodada final após migration 0220, tipos nullable e correção da colisão de publicação: **704 arquivos e 7.570 testes**, saída 0, sem unhandled errors. `pnpm gov:verify` inclui typecheck, lint, canais, papéis e unitários. Build final também passou, com controle positivo de Supabase local presente no bundle; não é uma imagem publicada nem um deploy.

Logs locais: `/tmp/zapfloo-onboarding-gov-reviewed.log`, `/tmp/zapfloo-onboarding-build-reviewed.log`, `/tmp/zapfloo-rascunho-db-final.log`. A rodada anterior de unitários encontrou as três regressões novas ainda antes da correção; foi descartada como gate final e repetida integralmente após o ajuste.

Limites do ambiente: Redis externo e IA não estão configurados para os E2Es; o fallback de rate limit em memória apareceu no log. Estes testes não provam integração real com Redis, WAHA, Meta ou IA. O aviso do SDK sobre getSession foi inspecionado na rota de token de Realtime: ela valida getUser antes de extrair o token; não foi tomado isoladamente como prova de bypass de autenticação.

Dois achados da revisão independente foram reproduzidos antes de corrigir:

- Cookie Secure derivado de NODE_ENV quebrava self-host HTTP. Agora usa `cookieSecure()`, helper canônico que lê o protocolo público em runtime; casos HTTP/HTTPS aprovados.
- Cookie de preferência de uma sessão anterior permitia ao admin pendente abrir o CRM em nova sessão AAL1. E2E reproduziu URL `/app/inbox` em vez de `/login/mfa`. A navegação alternativa agora chama `requireRole("admin")`, assim como o wizard. O mesmo E2E passou após a correção.

E2E funcional repetido com o build final após 0220 e correção de colisão: **dois casos aprovados, saída 0**, cobrindo convidado, exploração/recarga/retomada, estado compartilhado intacto, saída para outra organização e nova sessão sem completar MFA (`/tmp/zapfloo-onboarding-e2e-reviewed.log`). Capturas do banner no CRM em desktop/celular inspecionadas depois de aguardar o estado vazio da Inbox, sem usar skeleton como prova visual. O ambiente sintético usa a marca padrão; isso não representa alteração da marca da produção.

## Rascunho sem canal — base de persistência

Migration `20260908171945_0220_rascunho_sem_canal.sql`, apêndice idempotente no baseline e entrada no MANIFEST. Aplicada somente ao Supabase local de testes, além dos bancos efêmeros do harness.

- `draft` e `archived` podem ter canal nulo; `published` e `superseded` não podem.
- RLS, funções de publicação, imutabilidade das versões publicadas, credenciais e autorizações existentes não foram alteradas.
- Seis invariantes novos: falharam antes da migration por NOT NULL e passaram depois; incluem duas organizações e recusa de publicação sem canal.
- Banco completo após 0220: **158 arquivos, 1.250 aprovados e 1 ignorado**, saída 0. Baseline validado em install e update; container efêmero removido pelo harness.
- Tipos Row/Insert/Update da tabela extraídos automaticamente da geração da CLI local. Campos de Storage divergentes e não relacionados não foram transplantados.

Os testes de publicação deste lote verificam a restrição estrutural e a imutabilidade existente; não substituem um teste ponta a ponta da nova jornada ou da função canônica de publicação. Nenhum agente real foi ativado.

No fluxo legado, colisão com uma versão não publicada agora falha sem apontar o agente para ela. A resolução guiada dessa colisão pertence à próxima etapa: não há recuperação automática que publique ou sobrescreva o rascunho.

## Reversão e próxima etapa

Sem publicação ou mudança do banco remoto: nenhum rollback operacional na VPS a executar. A migration nova foi aplicada somente localmente. Para futura reversão de aplicação, preservar rascunhos e a migration aditiva; não restaurar NOT NULL enquanto existirem rascunhos sem canal. Revisar alterações isoladas por arquivo, sem reset destrutivo da pasta principal.

Próxima etapa funcional: criação transacional de rascunho inativo, ensaio sem canal e revisão vinculada à configuração exata, invalidada ao editar. Somente depois integrar a nova ordem de telas e a autorização explícita de contato. Teste externo de IA exige chave de teste e orçamento controlado; esta sessão não consumiu API de IA.
