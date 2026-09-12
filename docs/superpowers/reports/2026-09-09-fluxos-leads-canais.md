# Correções de fluxos, Leads e canal — 2026-09-09

## Escopo e causas confirmadas

- **Gatilho escondido:** o formulário já existia no botão da barra, enquanto o nó inicial dizia não ter configuração adicional. O mesmo componente agora atende barra e painel do nó, sem criar outro contrato de persistência.
- **Leads abria administração:** o menu apontava `/app/kanban`. A entrada `/app/leads` resolve o funil padrão ativo da organização confiável e abre seu quadro. Sem padrão, usa a ordem existente; sem funil ativo, mantém a lista com criação conforme papel. A aba Funis continua disponível.
- **Canal errado:** worker e envio inline escolhiam a conversa mais recente/sessão disponível, ignorando `followup_enrollments.conversation_id`. Com vínculo presente, ambos validam organização, contato, conversa individual e canal WORKING não arquivado antes de enviar. Não há fallback para outro chip nesses casos.

## Contratos mantidos

- Gatilho é configuração do ponteiro: salvar pode alterar um fluxo já publicado. Não se apresenta essa gravação como alteração apenas no desenho em rascunho.
- Manual começa pela API/integração. Etapa, silêncio e caso exigem habilitação Follow-up em versão publicada de agente, com o fluxo selecionado. Webhook exige regra de entrada apontando o fluxo publicado.
- Não foi adicionado gatilho genérico de mensagem recebida. `conversation_end` não é oferecido: não há produtor funcional.
- Sem conversa vinculada, permanece o fallback legado. A FK usa `ON DELETE SET NULL`; após exclusão física da conversa não é possível distinguir origem apagada de inscrição originalmente sem vínculo sem outra mudança de schema.
- A correção não cria conexões, publica fluxos nem inicia mensagens em contas de clientes.

## Verificação

- TDD: ausência de seletor no nó reproduzida pelo navegador; navegação e seleção de canal reproduzidas por testes antes das correções.
- Primeiro recorte Playwright: 3/3 passaram (gatilho, Leads, zoom), com fixtures locais isoladas. Capturas em `.superpowers/evidence/fluxo-gatilho/` e `.superpowers/evidence/leads-navegacao/`.
- Recorte Playwright final: 4/4 passaram em 1,3 minuto (gatilho, Leads, zoom e período de testes/composer). Inclui troca entre barra e painel, fechamento sem perda do rascunho, persistência confirmada no banco e clique real no botão de salvar após rolagem em 1440/768/390 px. Transportes externos não foram usados.
- PostgreSQL 15 efêmero: baseline aplicado em INSTALL e UPDATE com erro fatal habilitado; 50/50 testes passaram em cinco arquivos (`followup-canal-origem`, `followup-gatilho-etapa`, `followup-silence-sweep`, `followup-turn-bridge`, `followup-engine`). Exit 0, teardown concluído.
- Revisão independente encontrou perda do rascunho do gatilho ao fechar o painel/refazer consulta. Estado elevado ao canvas e compartilhado com a barra corrigiu fechamento, refetch e concorrência com uma gravação em andamento. Cinco testes dedicados passaram; a regressão também foi reproduzida vermelha no navegador antes do rebuild.
- Build integrado final (`pnpm e2e:build`, via Corepack) passou, incluindo TypeScript. Lint geral terminou com zero erros e 312 avisos existentes; lint final dos componentes alterados terminou sem avisos.
- `corepack pnpm typecheck` final passou (exit 0). A verificação completa dos testes encontrou uma opção `exact` indevida no helper do Testing Library; removida sem alterar a correspondência exata padrão. O arquivo foi reexecutado: 5/5 passaram, exit 0. `git diff --check` também passou.
- Primeira suíte geral: 7.817 testes passaram e quatro falharam. Corrigidos frontmatter de duas notas de versão e mock antigo que não representava a inscrição consultada pelo worker; nenhum guard de produção foi relaxado. Recortes corrigidos passaram. **Reexecução geral final: 743 arquivos e 7.826 testes passaram, zero falhas, exit 0** (`corepack pnpm test:unit --maxWorkers=6 --reporter=dot`, 338,65 segundos).

## Limites de entrega

Não houve deploy. Nova tentativa SSH não interativa nesta sessão alcançou a VPS e recebeu `Permission denied (publickey,password)`; nenhuma alteração remota foi executada. Os testes de envio substituem o transporte externo: provam alvo e recusa, não mensagem entregue no WhatsApp. Credencial real de IA e entrega por API Oficial/WAHA continuam exigindo verificação controlada com acesso autorizado ao ambiente.
