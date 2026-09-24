# Task 3 — schema de cobrança Monetizze

## Entregue

- Migration `0239` forward-only, sem `UPDATE` em assinaturas existentes.
- `organization_subscriptions` aceita `teste`, `ativo`, `recusado`, `cancelado` e `pausado`, com os novos campos comerciais nullable.
- `platform_billing_settings` nasce com `enforcement_enabled = false` e não é religado na reaplicação.
- `billing_provider_events` guarda somente o contrato normalizado: não há corpo bruto, chave da conta nem PII aberta.
- Ledger e configuração são server-only: RLS ligada, nenhum privilégio para `public`, `anon` ou `authenticated`, e controle positivo de acesso por `service_role`.
- `webhook_id` e `(sale_code, sale_status)` são únicos.
- `fn_processar_evento_monetizze` reivindica o evento e projeta a assinatura na mesma transação, serializa por organização e ignora regressões pelo relógio/parcela.
- A RPC não pode ser executada por `public`, `anon` ou `authenticated`; somente `service_role` recebeu `EXECUTE`.
- IDs externos aparecem apenas no `metadata` da auditoria; o `resource_id` continua UUID da organização.
- Tripla completa: migration, apêndice idempotente no baseline e entrada no MANIFEST.
- Tipos das superfícies novas foram regenerados contra Postgres descartável com o baseline aplicado. Para não incorporar drift antigo e alheio à tarefa, somente os quatro blocos gerados afetados foram transplantados; a igualdade byte a byte de cada bloco com a saída do gerador foi conferida.
- `tests/invariants/rls-completude-varredura.test.ts` registra apenas `billing_provider_events` como exceção server-only explícita; o detector genérico não foi afrouxado. A justificativa aponta para a prova negativa e o controle positivo em `rls-isolation.test.ts`.

## TDD e sabotagens

### RED inicial

Comando focado antes do schema:

```text
corepack pnpm test:db tests/invariants/cobranca-monetizze.test.ts tests/invariants/rls-isolation.test.ts
relation "public.billing_provider_events" does not exist
2 files failed; 8 failed / 38 skipped
```

### Sabotagem 1 — remover a unicidade de `webhook_id`

```text
FAIL tests/invariants/cobranca-monetizze.test.ts
deduplica tanto webhook_id quanto o par sale_code/sale_status
expected: "duplicate"
received: "ignored_out_of_order"
1 failed / 7 passed
```

### Sabotagem 2 — trocar o default do interruptor para `true`

```text
FAIL tests/invariants/cobranca-monetizze.test.ts
cria singleton de rollout desligado e não o liga ao reaplicar
expected: "false"
received: "true"
1 failed / 7 passed
```

As duas sabotagens foram desfeitas antes da rodada final.

## Provas verdes

Foco final, incluindo o gate global de completude RLS:

```text
3 files passed
89 tests passed
instalação do baseline: verde
reaplicação/upgrade do baseline: verde
test:db verde
```

Suíte completa de banco:

```text
Test Files  177 passed (177)
Tests       1468 passed | 1 skipped (1469)
Duration    378.80s
test:db verde
```

Verificações complementares:

```text
corepack pnpm typecheck — exit 0
eslint nos três invariantes tocados — exit 0
git diff --check — exit 0
```

## Fixture real

Não foi necessária para esta tarefa. O schema e a RPC usam exclusivamente o contrato interno normalizado aprovado em 2A. Nenhum nome de campo cru, alias ou regra de parsing da Monetizze foi inventado; isso pertence à Task 4 e depende da fixture real.

## Não medido

- Parser/autenticação da Monetizze e a rota pública do postback: fora do escopo desta tarefa.
- Receptor público e captura do postback real: fora do escopo desta tarefa.
- UI, bloqueio comercial e mudança do interruptor em produção: não implementados nem acionados aqui.
- E2E de navegador: esta tarefa muda apenas schema/RLS/RPC; a prova executada foi a suíte completa `test:db`.

## Correções após revisão independente

- `buyer_email_masked` agora exige um único formato de e-mail e pelo menos um `*` antes de `@`. O banco aceita `c***@example.test` e recusa `cliente@example.com`; a garantia de não guardar e-mail aberto deixou de depender somente do parser futuro.
- A monotonicidade da primeira assinatura ganhou uma prova real com duas sessões. Uma barreira de teste pausa o evento antigo depois de ele ler a ausência da projeção; a segunda sessão precisa aparecer bloqueada em `pg_stat_activity` pelo lock da organização. Depois da liberação, existe uma única assinatura e o evento mais novo vence.
- O comentário canônico de `organization_subscriptions.status` agora registra que `pausado` bloqueia o produto mesmo com `enforcement_enabled` desligado na migration 0239 e no apêndice 0239 do baseline. O bloco histórico 0234 do baseline e a migration antiga 0234 permanecem intactos; numa instalação fresca, o comentário 0239 posterior sobrescreve corretamente o texto histórico.

### RED de e-mail aberto

Antes do novo CHECK — e novamente na sabotagem que o enfraqueceu — o teste mostrou:

```text
FAIL aceita local mascarado e recusa e-mail aberto no ledger
expected false to be true
Test Files 1 failed (1)
Tests 1 failed | 9 passed (10)
```

### Sabotagem do lock de primeira assinatura

Ao remover somente o `FOR UPDATE` da organização no baseline, a segunda sessão terminou em vez de esperar a primeira:

```text
FAIL serializa duas primeiras assinaturas concorrentes e mantém o evento mais novo
o evento novo esperou o lock da organização em vez de projetar em paralelo
expected false to be true
Test Files 1 failed (1)
Tests 1 failed | 9 passed (10)
```

As duas proteções foram restauradas. A última rodada focada, feita após a correção tipada do helper assíncrono, terminou com `3 files passed` e `91 tests passed`; instalação e reaplicação do baseline ficaram verdes.

### Ajuste histórico do baseline

O texto original permaneceu no bloco histórico 0234 do baseline. A semântica atual de `pausado` aparece somente no apêndice 0239, em paridade com a migration 0239, e por estar depois substitui o comentário antigo ao instalar ou atualizar. A prova focada posterior terminou com `1 file passed`, `10 tests passed`, `install ok` e `update ok`.
