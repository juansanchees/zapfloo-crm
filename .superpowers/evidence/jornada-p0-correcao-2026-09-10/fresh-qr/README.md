# Prova fresca — QR real alcançado; pareamento pendente

10/set/2026, `codex/jornada-p0`, produto derivado de `codex/altura-shell`.
Comando: `node .superpowers/fresh-p0-correcao/run.mjs proof` com Node 22;
spec versionada `tests/e2e/vps-fresh-onboarding.spec.ts`, config fresh com opt-in,
sem seed/reset automático, artefatos automáticos sensíveis desligados.

## Comprovado nesta tentativa

- Perfil A isolado: Supabase/baseline + bootstrap-owner, um dono fictício e uma
  organização, sem agentes, versões, credenciais, rascunhos, canais ou MFA antes
  da jornada. WAHA e Redis reais, HTTP 200 e PONG.
- Chaves opcionais de IA/Resend ausentes no runner; app autenticado informou
  ausência da chave do provedor selecionado e envio de e-mail não configurado.
- Login → welcome com aceite → conexão → QR baixado (`naturalWidth > 0`).
- Medições por DOM, não a olho: em 1440/768/390, `scrollWidth <= viewport+1` e
  caixas visíveis do conteúdo dentro dos limites horizontais. Essas asserções
  passaram antes de o código ser exibido ao dono. As medidas em JSON foram
  anexadas em memória pelo Playwright; o reporter list não as persistiu em
  arquivo. Não há dump numérico independente para reproduzir os valores exatos.
- PNGs anexos foram capturados pela spec com QR mascarado. O código escaneável
  foi exibido no chat em arquivo temporário `0600`, dentro de diretório `0700`;
  ele não integra este pacote versionável.

## Limite observado

O transporte passou para `FAILED` antes de haver confirmação de pareamento.
Consulta de estado sanitizada em `/tmp/zapfloo-p0-estado-pareamento.log` confirmou
o estado; a contagem da mensagem fixa `QR refs attempts ended` no log local foi 1.
Nenhum número, token, conteúdo de conversa ou QR bruto foi copiado para este pacote.

Pendente: scan, avanço real por WORKING, adiamento da IA, funil, convite sem
Resend, conclusão em `onboarded_at`, MFA e reentrada na mesma instalação.
Não declarar a spec fresca verde nem inferir essas etapas a partir do QR.

O observador de atualização também revelou um defeito do harness: ao desaparecer
a imagem em `FAILED`, `getAttribute` sem timeout pode prender a Promise aguardada
no `finally`, estendendo o encerramento de10 até o limite total de16min. Foi
confirmado por leitura do cliente e do Playwright instalado; não foi corrigido
durante a execução viva. A retomada deve limitar essas operações e provar a
limpeza no erro, além de persistir os JSONs numéricos.

## Correção do próprio preflight

A primeira tentativa falhou antes de login por `HEAD select=id` em
`onboarding_drafts`, que só possui `organization_id`. Fix `af20e4b27`, gate AST
RED/GREEN e re-review aprovados. Sonda somente leitura confirmou 400 → 200/count0
sem modificar banco; por isso a segunda tentativa ainda começou fresca.
Logs: `/tmp/zapfloo-p0-fresh-proof.log`, `/tmp/zapfloo-p0-fresh-proof-r2.log` e
`/tmp/zapfloo-p0-fresh-preflight-coluna.log`. O erro do teste não foi tratado como
falha de credencial ou como confirmação de produto.
