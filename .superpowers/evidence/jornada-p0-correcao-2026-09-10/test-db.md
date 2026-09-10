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

## Retomada final — R2 vermelha e R3 isolada

R2 (`/tmp/zapfloo-p0-test-db-r2.log`) terminou exit1 em1010.87s:
165arquivos/1372testes passados,2arquivos/2testes falharam,1skip preexistente.
Falhas: `agenda-ida-ao-google-termina.test.ts:172` (editar não voltou à fila)
e `webhooks-trigger-events.test.ts:201` (timeout30s). Houve gov/E2E concorrentes
durante parte dessa execução; isso não prova a causa das falhas. Install/update
passaram e o próprio script removeu o contêiner efêmero6368.

A leitura dirigida confirmou que o caso da agenda compara `updated_at` com
`google_synced_at` em transações distintas. O log não capturou os timestamps
ou o estado efetivo dos triggers no instante do erro; não permite concluir
recuo do relógio, trigger ausente ou interferência. Nada foi alterado no teste,
schema ou timeout para a repetição.

R3 rodou integralmente **depois** do fim do E2ER5 e do govR7:

```text
corepack pnpm test:db > /tmp/zapfloo-p0-test-db-r3.log 2>&1
exit0
Test Files  167 passed (167)
     Tests  1374 passed | 1 skipped (1375)
  Duration  438.06s
==> test:db verde
==> teardown: removendo container deskcomm-test-db-54182
```

Baseline INSTALL/UPDATE aprovados com `ON_ERROR_STOP=1`; nenhuma mudança de
schema/invariantes/script/config durante a execução. Mesmo skip preexistente,
sem exclusão nova. Os dois casos vermelhos anteriores passaram nessa rodada,
mas a causa exata da intermitência permanece **não isolada**, não "corrigida".
