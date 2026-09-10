# Ambiente isolado da prova P0 — medição parcial

Não é conclusão da jornada. Nenhum pareamento foi comprovado nesta etapa.

- Worktree: `codex/jornada-p0`, rebase sobre `ce973b4a0` concluído; plano `943b14d4c`.
- Base antes de implementar: `corepack pnpm gov:verify`, Node 22.23.2, exit 0; 750 arquivos / 7.880 testes passados; lint 0 errors, 310 warnings conhecidos. Log local `/tmp/zapfloo-p0-base-rebase.log`.
- Supabase isolado `zapfloo-p0-correcao-20260910`, CLI 2.83.0, PostgreSQL 15.8. API 57321 / DB 57322. Nenhum contêiner da stack anterior foi alterado.
- Extensões do instalador habilitadas; `docker exec -i supabase_db_zapfloo-p0-correcao-20260910 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < supabase/baseline.sql` terminou exit 0. Cadeia de migrations não executada.
- `scripts/bootstrap-owner.ts` executado pelo harness com ambiente montado do zero, proprietário fictício. `RESEND_API_KEY` e chaves de provedores de IA ausentes; as chaves de criptografia interna obrigatórias não são credenciais de IA.
- WhatsApp: imagem do projeto fixada em `devlikeapro/waha@sha256:03872c42fdfac7c0620af189be60ea5d2b32f9ab8bfd5d6809c499b107115799`, variante `noweb-2026.7.2`, amd64 no Docker local arm64. `/api/server/status` retornou HTTP 200 com autenticação real.
- Redis: `redis:7-alpine` + ponte `hiett/serverless-redis-http@sha256:5b0bb9239fce53abf87b2018a7a0deb9ec7bd900c5360738fe5fbeeb426f9150`; POST REST `["PING"]` retornou HTTP 200 e resultado `PONG`.
- Portas dessas dependências publicadas somente em `127.0.0.1`: 57300, 57379 e 57380.
- Sonda HTTP temporária na porta do futuro app confirmou acesso de `zapfloo-p0-waha` a `host.lima.internal:3013` (exit 0). O contêiner P0 vazio foi recriado antes de qualquer sessão para configurar webhook de **estado** (`session.status,state.change`), preservando volumes; a prova de conexão não coleta conversas do telefone.
- Segredos gerados em arquivo ignorado, modo 0600; nenhum token/sessão/telefone incluído aqui.

Build fresco: exit0, log `/tmp/zapfloo-p0-fresh-build.log`; bundle contém o host
57321 e nenhum 57421 do perfil automático. App iniciado somente em localhost:3013,
`/login` HTTP200. Esta verificação HTTP não é prova de UX. Telemetria desligada.

E2E dirigidos e sabotagens de estado/avanço/saída estão documentados nos relatórios
das Tasks1–3. Pendente: QR carregado, pareamento com aparelho do dono, avanço real,
`onboarded_at`, reentrada fresca e cinco checks remotos CI.
