# Perfil local para as specs automáticas

Preparado em 10/09/2026, antes da primeira execução do Next.

- Supabase isolado `zapfloo-p0-ci-20260910`: API 57421, PostgreSQL 57422 e correio local 57424.
- Aplicado `supabase/baseline.sql`, com as extensões do instalador; comando concluiu com exit 0. Não aplicada a cadeia de migrations.
- Consulta após instalação: zero organizações. As specs automáticas criarão somente suas próprias fixtures.
- App reservado em localhost:3014. Runner local ignorado saneia o ambiente, usa Node 22 e não herda chaves de IA/Resend; Sentry e telemetria do Next desabilitados.
- Este perfil usa fronteiras indisponíveis/controladas de transporte como o CI. Não prova QR nem pareamento. A prova real está isolada no perfil `zapfloo-p0-correcao-20260910`, API57321/app3013, ainda recém-bootstrapado.
- Segredos locais estão em arquivos ignorados com permissão 0600, não nesta evidência. Banco compartilhado antigo e stack de pareamento não foram alterados pela preparação deste perfil.

Build de produção: `node .superpowers/ci-p0-correcao/run.mjs build` executou
`corepack pnpm e2e:build` em `c407b3525`, com Node22, e concluiu com exit **0**.
Log local: `/tmp/zapfloo-p0-ci-build.log`. A compilação usou API57421 e não a
instalação destinada ao pareamento.

Primeira rodada de specs: exit **1**, 3 passed / 5 failed / 8 did not run,
45,9 segundos. Log: /tmp/zapfloo-p0-e2e-normal.log.

- A nova negativa de sessão recusada passou (18,9s); ainda faltavam suas asserções
  adicionais de ausência de IA/e-mail, então não é aprovação da versão final.
- Quatro casos de troca de organização falharam antes da jornada por ausência do
  seed padrão .e2e-creds.json. Erro de preparação do perfil pelo controlador.
  Executado depois scripts/seed-e2e-credentials.ts no ambiente saneado API57421,
  exit0. Esse banco é o de fixtures CI, não o recém-bootstrapado da prova real.
- O wizard falhou ao procurar nome de negócio no header antigo. A screenshot
  registra Clínica Bem Viver na identidade lateral, e OnboardingFrame confirma
  h1 dentro da aside. A expectativa de nome atualizado permanece necessária;
  seu alvo deve ser a identidade real, não o cabeçalho que agora só tem marca e
  controles. Os oito casos seguintes não rodaram por serialização.

Resta repetir os grupos após corrigir preparação/seletor e completar a nova spec.
Não interpretar o primeiro erro como falha de produto nem apagar a evidência.

Segunda rodada: `node .superpowers/ci-p0-correcao/run.mjs test
tests/e2e/onboarding-sem-ia.spec.ts tests/e2e/troca-de-organizacao-tem-volta.spec.ts
tests/e2e/wizard-do-funcionario.spec.ts tests/e2e/onboarding-ativacao-restrita.spec.ts`.
Exit **1**, **10 passed / 2 failed / 2 skipped / 5 did not run**, 2 minutos.
Log: `/tmp/zapfloo-p0-e2e-normal-r2.log`.

- A prova negativa final passou, incluindo ausência de chaves no runner,
  retrato autenticado do app, estado/agentes/auditoria e reentrada.
- Os quatro casos de troca de organização passaram com o seed correto.
- Recuperação chegou ao fim, mas procurou o rótulo antigo Continuar para conexão;
  o controle do produto agora diz Continuar configuração.
- O wizard passou identidade, welcome e escolhas iniciais; parou na expectativa
  de texto cérebro do formulário antigo. Deve vigiar a ação real de configurar IA.
- Dois testes sintéticos foram pulados pela condição preexistente do provider de
  teste ausente; serão executados separadamente com o preload local. Cinco testes
  posteriores do wizard não rodaram por serialização.
- Os screenshots desta rodada foram copiados para `e2e-normal-r2/` antes de
  restaurar as onze imagens históricas que os specs sobrescreveram. Nenhuma prova
  antiga foi substituída por uma medição nova. São dados fictícios; outputs ainda
  precisam de revisão antes de versionamento.

Terceira rodada: `node .superpowers/ci-p0-correcao/run.mjs test
tests/e2e/wizard-do-funcionario.spec.ts tests/e2e/onboarding-ativacao-restrita.spec.ts`.
Exit **0**, **12 passed / 2 skipped**, 52,4s.
Log: `/tmp/zapfloo-p0-e2e-normal-r3.log`.
O wizard inteiro e a recuperação sem chave passaram. Os dois skips existentes
são os casos pt-BR/es que exigem o preload sintético, executados em rodada própria.
Nenhum PNG histórico foi sobrescrito nesta rodada; screenshots usam outputPath.

gov:verify consolidado, tentativa1: tipos e ESLint passaram (0 errors,
310 warnings preexistentes); lint:channels reprovou menção a provider no comentário
novo de skipWhatsapp.ts. O comando parou ANTES de test:unit; não há resultado da
suíte completa nesta tentativa. Log: `/tmp/zapfloo-p0-gov-final.log`.

Sintético R1, ativação + troca: exit1, 5 passed / 2 failed, 7,3min.
As duas falhas pt-BR/es foram em `#canal-teste`: o canal fictício foi inserido após
o SSR e o teste usou Conferir como refresh. A ação agora confirma transporte real
e corretamente recusou o transporte indisponível desta fixture. Os quatro testes
de troca, incluindo ensaio explícito com resposta sintética, passaram.
Log: `/tmp/zapfloo-p0-e2e-synthetic.log`.

Sintético R2, somente ativação: fixture criada antes do SSR, nenhuma asserção de
política removida. `node .superpowers/ci-p0-correcao/run.mjs synthetic
tests/e2e/onboarding-ativacao-restrita.spec.ts`, **exit0, 3 passed**, 1min.
Recuperação 14,3s; pt-BR 17,5s; es 19,4s. Log:
`/tmp/zapfloo-p0-e2e-synthetic-r2.log`. PNGs fictícios copiados para
`e2e-synthetic-r2/`; não são prova de transporte nem de pareamento.

Todos os grupos automáticos afetados passaram nas respectivas rodadas finais.
Os avisos de Redis indisponível/fallback em memória são do perfil CI controlado,
não do perfil fresco real. Next também emite avisos preexistentes de standalone
e DSN off usado para desabilitar telemetria. Não declarar saída sem avisos.
