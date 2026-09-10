# Jornada P0 — fechamento parcial de 10/set/2026

Branch: `codex/jornada-p0`, rebase sobre `codex/altura-shell` (`ce973b4a0`).
Implementação e correções dirigidas até `af20e4b27`. **Não está declarada pronta
para merge:** a prova fresca não completou o pareamento e não há cinco checks
remotos desta revisão. Sem deploy, merge, alteração de main ou acesso à VPS.

| CONCLUÍDO E TESTADO | PENDENTE | BLOQUEADO |
|---|---|---|
| Escritor tenant-safe de conexão, critério independente de IA, autoavanço/UUID/retry, adiamento auditado, saída única e cookie de 30 dias. Testes e sabotagens nas Tasks1–2; revisões aprovadas. Comando consolidado: `corepack pnpm gov:verify`, exit0, **755 arquivos/7913 testes**, lint0 erros/310 avisos. | Confirmar esses contratos no trecho positivo completo de uma instalação fresca com pareamento real. | A sessão real de QR chegou a `FAILED` com `QR refs attempts ended`; não houve confirmação de pareamento nesta janela assistida. |
| `corepack pnpm test:db`: exit0, **167 arquivos/1374 testes passados**, 1 skip preexistente. Baseline install/update aprovados. | Nenhuma mudança de schema nesta leva: diff contra altura-shell vazio em migrations/baseline/MANIFEST. Não requer nova tripla. | Nenhum bloqueio de banco observado. |
| E2E da nova ordem: normal12 passados; ativação sintética3 passados; troca4 passados; negativa pós-hardening1 passado. Specs em `tests/e2e/`; negativa registrada no CI. | Cinco checks remotos da branch e revisão final integrada. CI base PR7 tinha27 falhas/248 passados/8 skips; detalhes em `ci-base.md`, sem atribuir todos os vermelhos a esta leva. | Não é alegado bloqueio atual por cobrança; nenhum PR novo foi aberto nesta etapa. |
| `node .superpowers/fresh-p0-correcao/run.mjs proof` alcançou **QR real sem chave IA**, com WAHA/Redis vivos e banco fresco; asserções DOM em1440/768/390 passaram antes de exibir o QR. Evidência visual mascarada em `fresh-qr/`. | Scan → WORKING → avanço → adiar IA → funil → convite sem Resend → done/onboarded → MFA e reentrada no mesmo cenário. A spec positiva não foi aprovada por alcançar somente o QR. | Retomada assistida depende de disponibilidade simultânea do dono com o aparelho de teste e de um QR válido. |
| Proteção do QR temporário0700/0600, validação de cleanup e bloqueio de snapshots sensíveis; sonda Chromium real comprovou captura sem guard e ausência com guard. Preflight corrigido400→200, com gate AST/schema e re-review. | Dois defeitos de harness confirmados para corrigir antes de nova tentativa: JSONs de medidas não são persistidos pelo reporter list; observador do QR usa ações sem timeout e pode segurar o finally até16min quando a imagem some após FAILED. | Nenhum segredo/QR bruto está incluído nos artefatos versionáveis. |

## O QUE NÃO FOI MEDIDO

- Pareamento confirmado, `onboarded_at` preenchido e reentrada da prova fresca
  positiva; convite e MFA no mesmo cenário permanecem depois do ponto interrompido.
- Primeira mensagem, leitura de áudio, geração com credencial real, API Oficial
  ou números de clientes. Nenhuma mensagem foi enviada nesta prova.
- Inventário/alteração das três organizações de produção e funcionamento na VPS.
- Os cinco checks remotos desta revisão. O estado do PR7 é evidência da base,
  não desta branch. Não há declaração de ausência de todos os bugs.
- Gates no checkout principal: esta leva rodou em `.worktrees/jornada-p0`.
  Não apresentar isso como repetição do aceite histórico do checkout principal.
- Dump independente com os valores numéricos exatos de layout: as asserções DOM
  executaram, mas os anexos JSON em memória não foram persistidos pelo reporter.
- Aviso do GitHub no push:4 vulnerabilidades na branch padrão (1 alta/3 moderadas).
  Não houve triagem da validade ou aplicabilidade nesta leva; não atribuir esse
  aviso à branch P0 nem interpretar gates verdes como auditoria dessas dependências.

O E2E fresco terminou com **exit1/1 failed/16.0m**. O diretório temporário do QR
foi removido pelo cleanup; conferência posterior confirmou sua ausência.
Os commits de implementação, o snapshot parcial e o backup anterior ao rebase
foram salvos no remoto. Nenhum PR novo foi aberto.

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
- Próximo passo autorizado: corrigir os dois defeitos de harness, fechar a revisão
  integrada e salvar a branch. A prova positiva aguarda uma futura janela de scan;
  avisar antes de qualquer PR para medir o CI. Não abrir PR nem fazer deploy nesta
  retomada sem pareamento.
