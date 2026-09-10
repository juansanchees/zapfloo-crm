# Jornada P0 — conexão antes da IA (10/set/2026)

## Correção da leitura do recorte anterior

O pacote `.superpowers/evidence/jornada-p0-2026-09-10/` comprovou a escolha de
conexão e a saída de exploração diante de transporte indisponível. **Não
comprovou QR, pareamento nem conclusão do onboarding.** O estado final com
`onboarded_at=null` não demonstrava uma limitação deliberada: faltava um chamador
de produto para gravar `onboarding_state.whatsapp` sem ativar IA. Era um defeito.

A leva de correção está em `codex/jornada-p0`, rebaseada sobre `codex/altura-shell`.
O contrato do servidor foi corrigido e revisado em `eea045244`: somente UUID de
canal, sessão/tenant revalidados, canal não arquivado e saúde real `WORKING`
permitem gravar a conexão. A ativação de IA não é requisito dessa etapa.
**Os E2E dirigidos passaram e o QR real foi alcançado sem IA em 1440/768/390.
Pareamento, conclusão persistida e parecer final ainda estão pendentes.** O novo
pacote é `.superpowers/evidence/jornada-p0-correcao-2026-09-10/`; os logs antigos
permanecem históricos, sem reescrita ou apresentação como prova positiva.

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
lote, cujo escopo de execução é local. Nenhuma delas foi consultada ou alterada;
não confundir política de compatibilidade com inventário.

## Limites de autoridade e compatibilidade

- A saída reaproveita `explorarCrm`, com escopo usuário/organização, RBAC e MFA.
  Ela abre o Inbox e mantém o aviso de configuração pendente. Não simula conclusão
  do wizard nem envio de mensagem.
- A exploração é uma preferência separada de concluir o onboarding. Conectar
  precisa poder cumprir sua própria etapa sem IA; a continuação completa está
  sendo medida na prova fresca desta leva. Não se cria novo modo de separação
  nem se muda `em_teste`, `is_dry_run` ou regras de elegibilidade.
- A ordem humana primeiro é decisão aprovada de produto; não altera por si só
  agentes já ativos nem promete que o serviço de transporte esteja configurado.
- Nenhuma mudança de schema neste lote: diff contra `codex/altura-shell` não
  altera migrations, baseline nem MANIFEST. Migrations herdadas não são novas
  mudanças da jornada P0.
- Sem deploy, merge, alterações na VPS ou no arquivo local `.codex/config.toml`.

## Living System Checklist

- Configuração: escolha de conexão existente; nenhum knob novo.
- Entrada: welcome leva à conexão; a tela conserva o UUID retornado na criação
  durante o polling. Conexões existentes são relidas pela lista autenticada.
- Efeito: `markWhatsappConfigured` confirma saúde no servidor e grava somente
  `onboarding_state.whatsapp`; o roteador pode então oferecer IA opcional.
- Segurança: ativação restrita continua atrás de revisão; confirmar conexão
  grava somente seu marcador após verificação de tenant, papel e transporte.
- Feedback e retorno: falha de leitura ou confirmação fica visível, com nova
  tentativa explícita. Somente confirmação bem-sucedida avança; conexão não é
  descrita como ativação. Adiar IA preserva os dados anteriores.
- Descoberta: rota já registrada; conexão e IA opcional são caminhos separados.
- Auditoria: `onboarding.whatsapp_configured` e `onboarding.ai_skipped` identificam
  decisões efetivamente persistidas em `api_audit_log`, consultável pela tela
  existente `/app/audit`. Os eventos de ativação permanecem separados. Entrar na
  tela não inventa evento de execução ou envio.
- Saída: Explorar é único no layout e guarda uma preferência de 30 dias por
  usuário/organização; não escreve conclusão. Funil, equipe e `onboarded_at`
  continuam dependendo das etapas reais, não do cookie.
- Evidência anterior: `.superpowers/evidence/jornada-p0-2026-09-10/`, somente
  recorte de erro/exploração. Nova prova parcial, com QR real alcançado e sessão
  encerrada pelo transporte sem pareamento confirmado:
  `.superpowers/evidence/jornada-p0-correcao-2026-09-10/`. Distinguir unitários,
  invariantes de banco, fronteira controlada de E2E e pareamento real.
