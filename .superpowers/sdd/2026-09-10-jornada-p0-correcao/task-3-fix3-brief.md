# Task 3 — fix round 3/5

Base: 8f6851533372d23ad7f7626432ab82d61abce426. O dono autorizou avançar sem celular; a prova positiva continua pendente.

## Defeitos confirmados

1. Em `vps-fresh-onboarding.spec.ts`, o observador chama `getAttribute`, `evaluate` e `screenshot` sem limite. Quando o produto desmonta o QR em FAILED, o locator aguarda indefinidamente (`actionTimeout=0`). O finally da espera de 10 minutos aguarda esse observador e só o timeout total de 16 minutos encerra o teste. Log real: `/tmp/zapfloo-p0-fresh-proof-r2.log`, exit1, 1 failed/16.0m. Corrigir todas as operações e a parada, preservando a limpeza privada do QR. Verificar API instalada: não presumir que Locator aceita AbortSignal.
2. `medirConexao` anexa JSON por body; com reporter list a medição não ficou em disco. Persistir o JSON sanitizado em `testInfo.outputPath`, modo 0600, anexar por path. Não armazenar fonte do QR, telefone ou segredos.

## Ownership e aceite

- Executor original é dono somente da spec fresca, seus helpers focados e testes de regressão correspondentes, mais apêndice ao `task-3-report.md`. Root é dono de ledger, documentação e infraestrutura. Você não está sozinho: não reverta nem inclua mudanças do root. Sem subagentes/push/PR.
- Teste guiado por falha e sabotagem restaurada para os dois defeitos. Para o observador, exercitar Chromium real com DOM fictício que perde a imagem, provar encerramento/cleanup limitado sem backend, e não apenas mock de locator. Para JSON, conferir arquivo real, payload, modo 0600 e attachment por path.
- Pode extrair helper pequeno em `tests/e2e/utils/` para testar o comportamento real. Não criar framework, config paralela de CI nem alterar produto/schema. Um probe local isolado de Chromium é válido para diagnóstico; a regressão deve ficar versionada e executável sem segredo/pareamento.
- Não rodar a spec fresca nem usar o banco/perfil A: já foi consumido parcialmente, não é mais pristine. Não enviar mensagens. Não inventar WORKING/conclusão. Não abrir `.env*` ou runtime.json.
- Node22/corepack conforme brief original. Rodar testes focados, typecheck/lint dos arquivos próprios; a suíte completa será consolidada pelo root, não reexecutada por você.
- Commit nomeado só dos próprios arquivos e relatório. Reportar RED/GREEN, sabotagens, comandos/logs, o que não mediu. Não declarar jornada positiva concluída.
