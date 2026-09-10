# Jornada P0 — fechamento parcial de 10/set/2026

Branch: `codex/jornada-p0`, rebase sobre `codex/altura-shell` (`ce973b4a0`).
Implementação e correções dirigidas até `7ad671bd2`. **Não está declarada pronta
para merge:** a prova fresca não completou o pareamento e não há cinco checks
remotos desta revisão. Sem deploy, merge, alteração de main ou acesso à VPS.

| CONCLUÍDO E TESTADO | PENDENTE | BLOQUEADO |
|---|---|---|
| Escritor tenant-safe de conexão, critério independente de IA, autoavanço/UUID/retry, adiamento auditado, saída única e cookie de30 dias. Onda final também protege o contexto A→B, preserva UUID no erro e mantém alertas visíveis. `corepack pnpm gov:verify` R7:exit0, **755 arquivos/7922 testes**, lint0 erros/310 avisos. Sabotagens restauradas e revisão integrada/re-review concluídos. | Confirmar os contratos no trecho positivo completo da instalação fresca com pareamento real. | A sessão real de QR chegou a `FAILED` com `QR refs attempts ended`; não houve confirmação de pareamento nesta janela assistida. |
| `corepack pnpm test:db` R3 isolado:exit0, **167arquivos/1374testes passados/1skip preexistente**,438.06s. Baseline install/update aprovados e contêiner efêmero removido. Nenhuma mudança de schema contra altura-shell; tripla não se aplica nesta leva. | Causa exata da intermitência anterior não isolada. R2 teve falhas na reinserção na fila Google e no webhook de mudança de etapa; ambas passaram emR3 sem alterar testes/schema/timeouts. | Nenhum bloqueio de banco na última execução integral; R2 vermelha permanece documentada, não apagada. |
| BuildB final exit0. E2ER5, cinco specs no config normal: **19 passados/2 skips preexistentes**, exit0/2.6min. Recuperação A→B pela tela, medição390px e auditoria+1 passaram; PNG fictício preservado. Rodada sintética anterior3 passados é prova separada. | Cinco checks remotos desta revisão. CI base PR7 tinha27 falhas/248 passados/8 skips; detalhes em `ci-base.md`, sem atribuir todos os vermelhos a esta leva. | Não é alegado bloqueio atual por cobrança; nenhum PR novo foi aberto nesta etapa. |
| `node .superpowers/fresh-p0-correcao/run.mjs proof` alcançou **QR real sem chave IA**, com WAHA/Redis vivos e banco fresco; asserções DOM em1440/768/390 passaram antes de exibir o QR. Evidência visual mascarada em `fresh-qr/`. | Scan → WORKING → avanço → adiar IA → funil → convite sem Resend → done/onboarded → MFA e reentrada no mesmo cenário. A spec positiva não foi aprovada por alcançar somente o QR. | Retomada assistida depende de disponibilidade simultânea do dono com o aparelho de teste e de um QR válido. |
| Proteção do QR temporário0700/0600 e de snapshots sensíveis; preflight400→200. Em `6bea483ef`, watcher abortável e JSON0600 anexado por path: duas regressões Chromium passaram, inclusive repetição root (exit0, 3,6s); as duas sabotagens reprovaram e foram restauradas. Re-review aprovado. | Nova execução positiva, incluindo medições numéricas persistidas. Os JSONs antigos não foram recuperados nem inventados. | Nenhum segredo/QR bruto está incluído nos artefatos versionáveis. |

## O QUE NÃO FOI MEDIDO

- Pareamento confirmado, `onboarded_at` preenchido e reentrada da prova fresca
  positiva; convite e MFA no mesmo cenário permanecem depois do ponto interrompido.
- Primeira mensagem, leitura de áudio, geração com credencial real, API Oficial
  ou números de clientes. Nenhuma mensagem foi enviada nesta prova.
- Inventário/alteração das três organizações de produção e funcionamento na VPS.
- Os cinco checks remotos desta revisão. O estado do PR7 é evidência da base,
  não desta branch. Não há declaração de ausência de todos os bugs.
- Causa raiz dos timeouts/504 e da falha de reinserção na fila Google da rodada
  concorrente. Repetições isoladas passaram; isso não identifica a causa.
- Gates no checkout principal: esta leva rodou em `.worktrees/jornada-p0`.
  Não apresentar isso como repetição do aceite histórico do checkout principal.
- Valores numéricos exatos da tentativa fresca antiga: as asserções DOM
  executaram, mas os anexos JSON em memória não foram persistidos pelo reporter.
  A correção do harness guarda novos JSONs por path, testada em Chromium fictício.
  No alerta A→B a390px, foram provados os limites geométricos; não inventar os
  valores brutos que o teste não anexou.
- Aviso do GitHub no push:4 vulnerabilidades na branch padrão (1 alta/3 moderadas).
  Não houve triagem da validade ou aplicabilidade nesta leva; não atribuir esse
  aviso à branch P0 nem interpretar gates verdes como auditoria dessas dependências.

O E2E fresco terminou com **exit1/1 failed/16.0m**. O diretório temporário do QR
foi removido pelo cleanup; conferência posterior confirmou sua ausência.
Os commits de implementação, o snapshot parcial e o backup anterior ao rebase
foram salvos no remoto. Nenhum PR novo foi aberto.

A rodada automática concorrente posterior também ficou registrada: E2ER4
exit1/5failed4passed2skipped10notrun, com504/statement timeouts; govR6 interrompido
por SIGINT/exit130. R5 de navegador e R7 de governança foram executadas em
sequência e passaram sem suprimir testes nem ampliar timeouts. Não apagar os
vermelhos nem tratar uma repetição verde como causa raiz comprovada.

## Decisões tomadas na execução

1. Cookie de exploração com30 dias, seguindo a preferência existente de organização
   ativa. Se esse prazo não servir, o custo é ajustar expiração, sem schema.
2. Rebase solicitado prevalece sobre atualização por merge. Backup local preserva
   a antiga ponta `301530677`; publicar requer lease exato para não sobrescrever
   avanço concorrente. Não há merge automático.
3. O dono autorizou avançar sem celular: corrigir o harness e revisar código sem
   outra tentativa de pareamento nem estado simulado. Custo: o aceite positivo
   de conexão/conclusão permanece pendente até a prova assistida.
4. A regressão Chromium entra numa SPECS_PARTE existente, não no `test:unit`, pois
   o job verify não instala browser. Custo: execução curta adicional no E2E
   existente, sem novo job ou skip.

## Evidências e continuidade

- Relatórios dirigidos: `.superpowers/sdd/2026-09-10-jornada-p0-correcao/task-{1,2,3}-report.md`.
- Pacote sanitizado: `.superpowers/evidence/jornada-p0-correcao-2026-09-10/`.
- Logs brutos locais permanecem em `/tmp/zapfloo-p0-*`; não são apresentados como
  artefatos remotos. Credenciais efêmeras e estado de sessão não vão para Git.
- Ordem de integração permanece altura-shell antes de jornada-p0. A ponta contém
  a base por ancestralidade; não descartar os consertos herdados para abrir PR.
- A revisão integrada, as correções do harness e a repetição isolada dos gates
  locais foram encerradas. A prova positiva aguarda uma futura janela de scan;
  avisar antes de qualquer PR para medir o CI. Nenhum PR ou deploy nesta retomada.
- Provas desta retomada: `retomada-sem-celular.md`, `gov-local.md` e `test-db.md`
  no pacote de evidências. As skills de revisão e verificação orientaram a busca
  adversarial, as sabotagens e a separação entre prova de código e pareamento.
