# Prova dos gates no checkout principal — 10/09/2026

Diretório efetivo: `/Users/juansanches/Documents/ChatGPT/CRM SAAS Deskcomm`.
Branch de prova: `codex/prova-gates-principal`, commit `9066bfffd` (main `22620d85b` + cherry-pick de `dc175239b`). Nenhum merge na main.

Runtime: Node 22.23.2 selecionado pelo PATH; `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`. Sem `.env` ou `.env.local` presentes no checkout principal. Não foram removidos nem lidos arquivos de ambiente.

Os worktrees REAIS permaneceram em `.worktrees/onboarding-roxo` e `.worktrees/production-hardening`, ambos com `node_modules` próprios. No momento da prova, `.next` existia no primeiro e não no segundo. Não criei artefatos falsos para imitar o briefing. O novo worktree `jornada-p0` só foi criado DEPOIS dos testes.

| Comando (sem recorte de suíte) | Resultado | Log |
|---|---|---|
| `/usr/bin/time -p corepack pnpm lint` | exit 0; real 60,99 s; 0 erros, 310 warnings | `lint.log` |
| `/usr/bin/time -p corepack pnpm test:unit` | exit 0; real 237,11 s; Vitest 235,64 s; 702 arquivos; 7.544 passed + 1 expected fail (7.545) | `unit.log` |

Log de unit: zero ocorrências de `worktrees`, zero marcadores `FAIL`; rodapé sem falhas inesperadas. Os dois comandos usaram os scripts originais, sem limitar caminho, sem `--ignore-pattern` adicional e sem trocar a configuração por uma externa. Não confundir esses resultados com a prova anterior no worktree isolado.

Esta execução fecha a pendência de isolamento de escopo no checkout principal. Não prova a futura jornada P0, schema, RLS, build, E2E, serviço de WhatsApp ou visual. Esses lotes não começaram antes do fechamento destes gates.

`.codex/config.toml` permaneceu modificado pelo dono, fora dos commits. Nenhuma VPS foi acessada.
