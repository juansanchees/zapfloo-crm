# Plano de implementação — Zapfloo production hardening

> **Execução:** seguir em ordem, com teste vermelho antes de cada correção. Produção,
> Supabase remoto e publicação de imagens ficam fora até o checkpoint 8.

**Objetivo:** tornar o fork privado Zapfloo reproduzível, corrigir os defeitos medidos na
primeira instalação e provar a jornada completa sem perder o rollback da `v1.16.1`.

**Base:** branch `codex/production-hardening`, derivada de `v1.16.1` mais o commit que
ignora `.worktrees/`.

---

## Checkpoint 0 — ambiente e linha de base

**Arquivos:** nenhum.

1. Ativar Node 22 e pnpm 9.15.9 via `nvm`/Corepack, sem alterar lockfile.
2. Instalar dependências com `pnpm install --frozen-lockfile`.
3. Confirmar árvore limpa e que `.codex/config.toml` existe somente na árvore original.
4. Rodar os gates que cercam o escopo antes das alterações:

```bash
pnpm test:shell
pnpm vitest run tests/unit/openrouter-alcanca-o-produto-inteiro.test.ts
pnpm vitest run tests/unit/onboarding-agente-nao-publicado.test.ts
pnpm vitest run lib/event-log/drain-loop.test.ts
```

Se algum gate já falhar, registrar como falha de base e separar do defeito novo.

## Checkpoint 1 — identidade e registry próprios da Zapfloo

**Arquivos principais:**

- Modificar: `hostgator-setup-kit/_common.sh`
- Modificar: `hostgator-setup-kit/install.sh`
- Modificar: `hostgator-setup-kit/comecar.sh`
- Modificar: `docker-compose.prod.yml`
- Modificar: `Dockerfile`
- Modificar: `Dockerfile.worker`
- Modificar: `Dockerfile.scheduler`
- Modificar: `.github/workflows/publish-image.yml`
- Modificar: `.github/workflows/release.yml`
- Modificar: testes de namespace já existentes em `tests/unit/` e
  `hostgator-setup-kit/test-validators.sh`

1. Primeiro alterar os testes para exigir:
   - repo `https://github.com/juansanchees/zapfloo-crm`;
   - namespace `ghcr.io/juansanchees`;
   - imagens `zapfloo-crm`, `zapfloo-worker`, `zapfloo-scheduler`;
   - títulos OCI Zapfloo, preservando licença MIT e procedência.
2. Rodar os testes específicos e confirmar vermelho pelos literais antigos.
3. Trocar somente identidade operacional, links de clone e nomes de pacote. Não apagar
   atribuição/licença histórica nem fazer uma varredura cega de toda menção documental.
4. Rodar `pnpm test:shell` e os testes de namespace até ficarem verdes.

## Checkpoint 2 — heredoc seguro e defaults WAHA comprovados

**Arquivos:**

- Modificar: `hostgator-setup-kit/install.sh`
- Modificar: `hostgator-setup-kit/test-validators.sh`
- Modificar: `docker-compose.prod.yml`

1. Adicionar caso shell que extrai/executa o caminho de bootstrap e falha se qualquer
   command substitution do shell ocorrer dentro do SQL.
2. Incluir controle positivo: uma palavra comum em comentário SQL não pode virar comando.
3. Confirmar vermelho com a crase em `locale` no heredoc atual.
4. Remover crases executáveis do bloco ou proteger o heredoc mantendo as variáveis SQL
   explicitamente parametrizadas; preferir a menor mudança compatível com o script atual.
5. Fixar e testar `devlikeapro/waha:noweb-2026.7.2` e
   `WHATSAPP_DEFAULT_ENGINE=NOWEB`; impedir que `WAHA_DEFAULT_ENGINE` seja gravada como
   variável morta.
6. Rodar `bash hostgator-setup-kit/test-validators.sh` duas vezes para provar reexecução.

## Checkpoint 3 — URL do pooler compatível sem degradar TLS

**Arquivos:**

- Modificar: `hostgator-setup-kit/install.sh`
- Modificar: `hostgator-setup-kit/_common.sh`
- Modificar: `hostgator-setup-kit/test-validators.sh`

1. Criar matriz vermelha para URL sem query, com query existente, com parâmetro repetido e
   URL não-Supabase.
2. Criar em `_common.sh` um normalizador shell único e aplicá-lo no instalador somente
   a URLs de Session pooler Supabase, incluindo uma única vez a opção de compatibilidade
   necessária ao `pg` da imagem atual.
3. Não imprimir a URL nem a senha nos testes/logs.
4. Não trocar `verify-full` por `no-verify`; a compatibilidade temporária não pode virar
   desativação silenciosa de TLS.
5. Provar parse, conexão mockada e preservação literal dos demais parâmetros.

## Checkpoint 4 — organização nova herda provider e modelo coerentes

**Arquivos:**

- Modificar: `lib/env.ts`
- Criar: `lib/ai/installation-default.ts`
- Criar: `lib/ai/installation-default.test.ts`
- Modificar: `lib/auth/provision.ts`
- Modificar: `app/api/v1/admin/tenants/route.ts`
- Modificar: `scripts/bootstrap-owner.ts`
- Criar: `supabase/migrations/20260907220000_0219_ai_provider_default_da_instalacao.sql`
- Modificar: `supabase/baseline.sql` com apêndice idempotente equivalente
- Modificar: `supabase/migrations/MANIFEST.md`
- Modificar: `tests/invariants/quadro-do-onboarding.test.ts` ou criar invariante dedicado
- Modificar: `tests/e2e/vps-fresh-onboarding.spec.ts`

1. Testar primeiro que `AI_PROVIDER=openai` produz settings iniciais com provider OpenAI.
2. Testar que valor inválido cai no default seguro e não derruba o app.
3. Alterar `fn_seed_org_llm_defaults` para respeitar provider explícito no INSERT e buscar
   o `is_default_for_provider` correspondente; provider e modelo nunca podem nascer de
   famílias diferentes.
4. Passar os settings em todos os caminhos reais de criação de tenant: signup/recovery,
   admin da plataforma e bootstrap.
5. Preservar organizações existentes e escolhas feitas pela tela; sem backfill amplo.
6. Provar com Postgres efêmero que uma org OpenAI nasce com modelo OpenAI e uma org sem
   configuração mantém o comportamento legado.
7. Rodar `pnpm test:db` por tocar função/schema tenant-aware.

## Checkpoint 5 — diagnóstico de IA acionável

**Arquivos:**

- Modificar: `app/onboarding/testar/_client.tsx`
- Modificar conforme contrato real: rota de teste em
  `app/api/v1/ai/agents/[id]/versions/[vid]/test/route.ts`
- Criar/modificar testes próximos à rota e em `tests/unit/`
- Modificar: `lib/i18n/dicionario.ts`

1. Escrever testes para quatro causas: provider sem credencial, provider divergente,
   credencial rejeitada/sem autorização e falha de geração/saldo.
2. Manter código de erro estável na API e texto humano na UI; não inferir saldo quando o
   provedor só devolveu erro genérico.
3. Remover a recomendação única que manda sempre para `IA › Credenciais` quando a causa é
   configuração/modelo.
4. Provar pt-BR e espanhol nos textos novos.

## Checkpoint 6 — worker carrega o dreno e o LGPD continua funcionando

**Arquivos:**

- Modificar: `workers/lgpd-export-worker.handler.ts`
- Modificar: `workers/lgpd-export-worker.ts`
- Modificar: `lib/event-log/register-handlers.ts` somente se o contrato precisar
- Criar: `tests/unit/worker-event-log-import.test.ts`
- Modificar: `Dockerfile.worker`

1. Reproduzir dentro da imagem worker o import de `runEventLogDrainLoop` e registrar o erro
   atual de subpath do pacote de hifenização.
2. Criar teste que importa/registra todos os handlers sem renderizar PDF no startup.
3. Tornar o import de `processLgpdExport` lazy no limite do handler, mantendo o registro
   leve; a versão atual do renderer só será alterada se o teste de renderização também
   reproduzir incompatibilidade fora da imagem antiga.
4. Construir `Dockerfile.worker`, iniciar com env sintético seguro e comprovar ausência de
   `event-log drain OFF`.
5. Rodar testes de PDF/LGPD para impedir que a correção apenas esconda o erro até o evento.

## Checkpoint 7 — gates locais e revisão

1. Conferir diff, arquivos gerados e ausência de `.env`, dumps ou segredos.
2. Rodar:

```bash
pnpm typecheck
pnpm lint
pnpm lint:channels
pnpm lint:role-rank
pnpm test:unit
pnpm test:shell
pnpm test:db
docker build -f Dockerfile -t zapfloo/app:local .
docker build -f Dockerfile.worker -t zapfloo/worker:local .
docker build -f Dockerfile.scheduler -t zapfloo/scheduler:local .
```

3. Fazer revisão adversarial do diff e corrigir achados com novo teste vermelho.
4. Commitar por unidade lógica e enviar a branch privada.

## Checkpoint 8 — CI, PR e proteção da main

1. Abrir PR de `codex/production-hardening` para `main`.
2. Confirmar execução dos cinco checks: `verify`, `build-and-size`, `invariants`, `e2e`,
   `imagens-ok`.
3. Configurar branch protection da nova `main` exigindo os checks que efetivamente
   aparecerem no repositório Zapfloo, sem copiar nomes não observados.
4. Não mergear nem publicar release com check vermelho ou ausente sem justificativa
   explícita.

## Checkpoint 9 — release, deploy progressivo e rollback

1. Registrar imagens/digests atuais, estado dos contêineres e backup pré-deploy.
2. Publicar tag Zapfloo imutável pelo CI.
3. Atualizar a VPS mantendo compose e `.env`; nunca imprimir valores.
4. Smoke: containers, health interno/externo, HTTPS, login e tenant.
5. Jornada real acompanhada: SMTP, recuperação, QR, `WORKING`, inbound, geração OpenAI e
   outbound.
6. Observar logs e alerta. Se falhar, restaurar imagens anteriores; banco só é restaurado
   se houver evidência de dano de dados.

## Checkpoint humano ainda necessário

- Credenciais do SMTP serão inseridas no painel por canal seguro.
- O usuário escaneará o QR do número definitivo.
- A conta OpenAI precisa ter faturamento/créditos para a geração real.
- Exclusão da chave acidental `Test - Zapfloo` exige autorização pontual no momento da
  exclusão.

## Definição de concluído

Não declarar "redondo" antes de: gates verdes, imagens próprias publicadas, worker sem
fallback involuntário, organização fresca coerente, jornada WhatsApp/IA real aprovada e
restore/rollback exercitados.
