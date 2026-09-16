# Falha do provedor no ensaio do onboarding — 15/set/2026

## Contrato

O ensaio continua sendo a prova recomendada antes da ativação. Se o provedor
recusar a chamada, a tentativa vira uma linha de `llm_calls` com classificação
do Zapfloo, status HTTP, `type`, `code` e `finishReason` seguros. Prompt, corpo
da resposta, chave e dado do cliente não entram nessas colunas.

Um `model_not_found` tenta o próximo modelo ativo e compatível do mesmo provedor.
Quando a reserva responde, ela também substitui o modelo do rascunho e da versão
que será publicada antes de o ensaio ficar verde; não existe prova positiva de
um modelo e publicação silenciosa de outro.
Falhas de credencial, saldo, modelo, demora, resposta vazia ou cortada não
prendem a pessoa: ela pode preparar a conexão, mas a tela deixa explícito que a
IA continua desligada e não oferece a ativação restrita sem ensaio aprovado.

Quando a OpenAI devolve `insufficient_quota` ou
`credit_balance_exhausted` usando a chave compartilhada da instalação, o seam
abre um incidente global crítico e deduplicado em `/admin/incidents`: “A IA
parou porque o saldo da conta da OpenAI acabou.” A tela do cliente mostra
apenas “A IA está indisponível no momento; já avisamos o suporte.” O mesmo erro
numa credencial própria da organização permanece isolado nela e não declara
pane da plataforma para os outros clientes.

## Living System Checklist

- **Entrada:** `runModelCall` recebe a resposta real do provedor; o estado dos
  canais vem de `channel_sessions` e o do agente de `ai_agents`.
- **Saídas:** a falha alimenta `llm_calls`, `incidents`, o ensaio do onboarding
  e `GET /api/v1/ai/automatico-ativo`.
- **Log/atividade:** `llm_calls` preserva a causa técnica segura; saldo esgotado
  abre incidente global deduplicado. A mudança de acesso do canal continua em
  `api_audit_log` por `channel.ai_access_updated`.
- **Tela:** o motivo aparece no ensaio; o estado “atendendo todos / em teste /
  desligada” aparece no Dashboard e em Agentes; o incidente aparece no painel
  de administração da plataforma.
- **Porta:** nenhuma tela nova. Dashboard, Agentes, Conexões e
  `/admin/incidents` já estão no registro de navegação.
- **Anti-morte:** falha do ensaio oferece conexão com a IA desligada; allowlist
  vazia mostra `0 números autorizados` e oferece liberar ou autorizar.
- **Configuração:** o acesso continua sendo alterado pela tela de Conexões; a
  seleção avançada de modelo continua em Agentes › Avançado.
- **Continuidade IA↔humano:** saldo global vira incidente para o administrador;
  o cliente recebe aviso seguro e pode continuar atendimento manual pelo Inbox.
- **Laço de retorno:** nova tentativa bem-sucedida vira a última `llm_call`, mas
  o alerta global continua visível para todos até resolução explícita pelo
  administrador. Uma resposta isolada não prova que o saldo compartilhado foi
  recomposto para a plataforma inteira.
- **Mapa vivo:** `docs/architecture/onboarding-ensaio.architecture.json` liga
  seam, telemetria, incidente e superfícies visíveis.

## Limites da prova

Os testes do provedor usam respostas simuladas; nenhuma mensagem comercial é
enviada. A verificação real na VPS foi somente leitura e confirmou a alternância
429/200 da chave da instalação sem imprimir a chave.
