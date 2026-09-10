# Retomada sem celular — provas e limites

Branch `codex/jornada-p0`, produto em247017a41/bee9e8ff0, sequência E2E corrigida
em7ad671bd2; documentos atéed96e8848. Node22.23.2/corepack pnpm9.15.9. Os comandos
abaixo foram executados em `.worktrees/jornada-p0`, não no checkout principal.
Nenhum PR, merge, deploy, acesso à VPS, nova tentativa de pareamento ou envio real.

## Quatro correções da revisão integrada

- Adiar IA compara o contexto exibido com a organização e o usuário revalidados
  antes de carregar/gravar/auditar. Erro de contexto tem recuperação pela tela.
- Erros HTTP/rede do polling preservam o UUID necessário à confirmação posterior.
- Erro de confirmação continua visível ao sair da opção de QR.
- O preflight não entrega registros pessoais aos matchers. Seu controle usa a
  versão instalada do Playwright, não somente o matcher do Vitest.

Provas dirigidas e sabotagens restauradas estão em
`.superpowers/sdd/2026-09-10-jornada-p0-correcao/final-fix-report.md`.
Re-review dos quatro findings e da correção subsequente de sequência E2E aprovado
em código, sem novo Critical/Important; isso não substitui os aceites pendentes.

## Build e navegador

O runner local `.superpowers/ci-p0-correcao/run.mjs` é infraestrutura efêmera,
não receita portável de clone. Usa perfil B/API57421/app3014 com dados fictícios,
separado da sessão real parcialmente consumida. Segredos locais não vão ao Git.
As specs são versionadas e pertencem ao config normal de Playwright.

```text
node .superpowers/ci-p0-correcao/run.mjs build
exit0 — /tmp/zapfloo-p0-ci-build-final.log

node .superpowers/ci-p0-correcao/run.mjs test \
  tests/e2e/troca-de-organizacao-tem-volta.spec.ts \
  tests/e2e/onboarding-sem-ia.spec.ts \
  tests/e2e/wizard-do-funcionario.spec.ts \
  tests/e2e/onboarding-ativacao-restrita.spec.ts \
  tests/e2e/observador-qr-fresco.spec.ts
exit0 — 19 passed, 2 skipped, 2.6min
/tmp/zapfloo-p0-e2e-final-r5.log
```

R5 rodou sem gov/test:db concorrentes. As duas exclusões condicionais já existiam:
ativação pt-BR/es requer o perfil de provedor sintético; não foram criadas para
obter este verde. A rodada sintética anterior está em `ci-local.md`, não faz parte
dos19 aprovados aqui. Não houve chave real de IA nem envio WhatsApp neste perfil.

O caso A→B passou: gesto antigo não altera B nem acrescenta auditoria; link
de recuperação chega às boas-vindas; checkbox/Continuar → conexão → IA opcional
exibe o rascunho B; adiar acrescenta exatamente uma auditoria para B e preserva
o rascunho. Retorno posterior para A também foi conferido.

Em390px, o teste mediu `getBoundingClientRect` e `scrollWidth`: borda esquerda
≥-1px, direita≤391px e documento≤viewport+1px. Essas são as asserções aprovadas,
não valores brutos inventados. PNG fictício inspecionado:
`adiar-ia-contexto-antigo-390.png`. A marca padrão da fixture não é prova da marca
configurada em produção; o screenshot não contém QR, telefone ou cliente real.

## Rodada concorrente vermelha — preservada

- E2ER4: exit1,5failed/4passed/2skipped/10notrun,6.5min. Log
  `/tmp/zapfloo-p0-e2e-final-r4.log`. Foram observados getUser504 e statement
  timeouts. A falha de troca ocorreu antes do novo recovery, esperando welcome
  e recebendo inbox; não atribuir esse erro ao finding estático da expectativa
  posterior de setup-ai. Artefatos brutos somente locais e privados.
- GovR6: unitários fora do fix apresentaram timeouts; root enviou SIGINT para
  o próprio Vitest. Exit130, sem rodapé completo. Log
  `/tmp/zapfloo-p0-gov-final-r6.log`. Não é sucesso nem suíte completa medida.
- DBR2: exit1,165arquivos passed/2failed;1372testes passed/2failed/1skip,
  1010.87s. Agenda não recolocou o compromisso editado na fila; webhook de
  mudança de etapa excedeu30s. Log `/tmp/zapfloo-p0-test-db-r2.log`.
  Install/update passaram e o teardown removeu somente o contêiner efêmero.

Não basta proximidade temporal para atribuir essas falhas ao ambiente. R5
mostrou que os casos de navegador passam nessa execução após a correção de
sequência, mas não explica sozinho o504 nem as falhas unitárias/de banco.

## Governança isolada

`corepack pnpm gov:verify > /tmp/zapfloo-p0-gov-final-r7.log 2>&1` terminou
**exit0:755arquivos/7922testes**,310.43s de Vitest. Typecheck e lints passaram,
com0erros/310avisos no ESLint. Não houve mudança de teste/timeout para repetir.
BancoR3 integral isolado terminou **exit0:167arquivos/1374testes passed/1skip
preexistente**,438.06s, install/update aprovados e cleanup do contêiner54182.
Comando `corepack pnpm test:db`, log `/tmp/zapfloo-p0-test-db-r3.log`.
Os dois casos anteriormente vermelhos passaram sem alterações. A causa exata
da intermitência não foi isolada; detalhes em `test-db.md`.

Após atualizar a documentação, `corepack pnpm exec vitest run
tests/unit/mapas-de-arquitetura.test.ts tests/unit/numero-de-jornada-e-unico.test.ts
--reporter=dot` terminou exit0:2arquivos/119testes,1.50s. Log local
`/tmp/zapfloo-p0-docs-encerramento.log`.

## Não medido por esta retomada

Pareamento real, WORKING real seguido de conclusão/reentrada fresca, primeira
mensagem, áudio, IA com credencial real, API Oficial, estado das organizações de
produção e cinco checks remotos. O perfil A não foi resetado nem chamado de
fresco novamente. Não há mudança de schema desta leva contra altura-shell.
