# Retomada sem aparelho — correção do harness

Implementação: `6bea483ef`, branch `codex/jornada-p0`. Produto e schema não
foram alterados nesta rodada. O dono autorizou avançar sem parear o telefone.

## Provas executadas

- Regressão versionada: `tests/e2e/observador-qr-fresco.spec.ts`, adicionada à
  `SPECS_PARTE_2` existente. Usa Chromium e DOM fictício, sem app, banco ou WhatsApp.
- Sabotagem do observador: remover o sinal de cancelamento elevou o encerramento
  a 953,9ms e reprovou a asserção de 250ms; 1 failed/1 passed. Restaurado.
- Sabotagem do attachment: trocar path por body fez a regressão reprovar;
  1 failed/1 passed. Restaurado.
- GREEN do executor: 2 passed/3,8s. Gate de cobertura: 1 arquivo/5 testes passed.
  ESLint focal exit0. Relatório completo: `task-3-report.md`, fix round3.
- Repetição independente do root: **exit0, 2 passed/3,6s**, Node22.23.2 e
  corepack pnpm9.15.9. Comando local:
  `corepack pnpm exec playwright test --config=.superpowers/fix3/playwright.observador.config.ts --output=<diretorio-temporario-exclusivo>`.
  Log: `/tmp/zapfloo-p0-fix3-root.log`.
- Sonda filesystem do root confirmou modo **0600** tanto no JSON de medidas
  quanto na cópia real em `attachments/`. O teste confere payload sem texto, src
  ou marcador sensível runtime, com geometria/estilo identificados por tag:índice.

A config local acima é temporária, sem globalSetup/webServer/env. Não é parte
da entrega: a spec e os dois helpers estão versionados; no CI a execução ocorre
pela config normal e lista existentes. Não alegar que o comando com arquivo
temporário é reproduzível diretamente num clone. Em ambiente E2E preparado,
`corepack pnpm exec playwright test tests/e2e/observador-qr-fresco.spec.ts`
seleciona a regressão pela configuração padrão.

## Limites

- Isto prova cancelamento/cleanup após remoção da imagem e persistência segura
  dos JSONs. Não prova pareamento, WORKING, onboarded_at, convite ou MFA frescos.
- Não houve outra tentativa de conexão nem alteração do banco parcialmente
  consumido. Nenhuma mensagem foi enviada.
- Os JSONs de layout da tentativa antiga não foram recuperados nem inventados.
  A correção passa a persistir medições futuras; a tentativa anterior permanece
  documentada com asserções executadas e screenshots mascarados, sem dump numérico.
- O resultado do CI remoto desta revisão ainda não foi medido.
