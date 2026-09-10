# Banco — execução local de 10/set/2026

- Branch: `codex/jornada-p0`, HEAD ao iniciar `f00b2f6d7f279680cfcec51e55011a84e3b2dbae`.
- Runtime: Node 22.23.2, corepack/pnpm 9.15.9, Docker local.
- Comando: `corepack pnpm test:db > /tmp/zapfloo-p0-test-db.log 2>&1` (com permissão de Docker/rede local).
- Exit real do processo: **0**.
- Postgres efêmero exclusivo `deskcomm-test-db-31946`, pgvector/pgvector:pg15, removido pelo teardown do próprio script.
- Baseline modo INSTALL: aprovado com `ON_ERROR_STOP=1`.
- Baseline modo UPDATE: aprovado com `ON_ERROR_STOP=1`, zero erro na reaplicação.

Rodapé do Vitest:

```text
Test Files  167 passed (167)
     Tests  1374 passed | 1 skipped (1375)
  Start at  15:42:38
  Duration  452.94s
==> test:db verde
==> teardown: removendo container deskcomm-test-db-31946
```

O único skip já existia em `tests/invariants/webhooks-inbound.test.ts:539`:
limite de requisições HTTP, documentado ali como coberto pelo teste unitário do
fallback em memória. Nenhum skip foi adicionado nesta leva.

Baseline, invariantes, script e configuração de banco permaneceram intocados
durante a execução; ajustes concorrentes ficaram restritos à UI/testes unitários
e ao plano documental. O próprio script recusa resultado de árvore DB alterada.
Isso não prova QR, pareamento, interface completa, CI ou produção. O banco fresco
destinado à prova manual de onboarding é outro e permaneceu preservado.
