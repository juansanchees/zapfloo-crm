# Jornada P0 — conexão antes da IA (10/set/2026)

## Premissa confirmada

Antes deste lote, `app/onboarding/connect-whatsapp/page.tsx:24` redirecionava
`!state.ai` para `setup-ai`; a linha 34 também substituía a conexão por outra tela
quando faltava referência de ensaio revisado. Isso bloqueava o wizard, não todas
as conexões: `/app/connections` e o POST de sessão não exigiam IA.

## Compatibilidade explícita — inclusive as três organizações existentes

Esta alteração não faz backfill, não cria agente e não grava configuração ao
renderizar a conexão. A política é a mesma para cada uma das três organizações:

| Estado anterior | Estado após atualizar/retomar |
|---|---|
| Agente publicado ou ativação restrita registrada | Preservado; não desativar nem publicar outra versão. |
| Rascunho/ensaio preparado, sem ativação | Preservado; conectar/abrir conversas não o ativa. |
| Sem agente/configuração de IA | Continua sem agente e sem ativação automática. |
| Canal existente `open` | Continua `open`; não impor teste retroativamente. |
| Canal existente `allowlist` ou `pre_go_live` | Mantém modo, lista e autorizações. |
| Canal legado sem chave `ai_gate` | Mantém o fallback explícito de compatibilidade `open` do resolvedor existente. Isso NÃO prova que exista agente publicado. |
| Novo canal criado pelas rotas do produto | Factory existente: `ai_gate=allowlist`, `ai_gate_mode=pre_go_live`, lista vazia. Sem autorização de IA até escolha explícita. |

O inventário individual das três organizações de produção NÃO foi medido neste
lote. O conector disponível não lista o projeto de produção. Nenhuma delas foi
consultada ou alterada; não confundir política de compatibilidade com inventário.

## Limites deliberados

- A saída reaproveita `explorarCrm`, com escopo usuário/organização, RBAC e MFA.
  Ela abre o Inbox e mantém o aviso de configuração pendente. Não simula conclusão
  do wizard nem envio de mensagem.
- A IA é opcional para conectar e entrar no atendimento humano. O percurso de
  configuração completo continua separado; este lote não inventa um novo modo
  de separação e não muda `em_teste`, `is_dry_run` ou regras de elegibilidade.
- A ordem humana primeiro é decisão aprovada de produto; não altera por si só
  agentes já ativos nem promete que o serviço de transporte esteja configurado.
- Nenhuma mudança de schema. Migration 0228 NÃO criada; baseline e MANIFEST intactos.
- Sem deploy, merge, alterações na VPS ou no arquivo local `.codex/config.toml`.

## Living System Checklist

- Configuração: escolha de conexão existente; nenhum knob novo.
- Efeito: o guard de página deixa de exigir IA para apresentar a conexão.
- Segurança: ativação restrita continua atrás de revisão; nenhuma mutação nova.
- Feedback: falha de leitura de canais é visível; conexão não é descrita como ativação.
- Descoberta: rota já registrada; conexão e IA opcional são caminhos separados.
- Auditoria: os eventos existentes de conexão/ativação continuam nos respectivos
  consumidores. Entrar na tela não inventa evento de execução ou envio.
- Evidência: relatório e artefatos em `.superpowers/evidence/jornada-p0-2026-09-10/`.
  Distinguir testes de página/estado, banco local e transporte real não medido.
