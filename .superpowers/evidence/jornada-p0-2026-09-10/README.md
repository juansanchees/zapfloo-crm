# Evidências — desbloqueio da conexão sem IA

Data: 10/set/2026. Checkout: `.worktrees/jornada-p0`, branch `codex/jornada-p0`.
Base: `codex/onboarding-roxo` em `4b9aadafd` + gates `373309765`
(cherry-pick de `dc175239b`, preservando a exclusão `.superpowers/` do ESLint).

## O que esta prova cobre

- Bloqueio real do wizard removido; não se alegou que toda conexão do produto
  estivesse bloqueada. Guard original: `connect-whatsapp/page.tsx:24`.
- Conexão antes de configurar IA; ativação restrita ainda exige referência válida.
- Nenhuma mutação nova de agente, canal ou schema. Políticas existentes preservadas.
- Prova Playwright local dedicada, não a suíte E2E inteira nem o CI.

## Ambiente de navegador

Supabase CLI 2.83.0, projeto isolado `zapfloo-jornada-p0-20260910`, PostgreSQL
15.8.1.085, portas 55321/55322. Não foi utilizado o Supabase local compartilhado
nem o projeto de produção. Instaladas as extensões exigidas pelo instalador e
aplicado `supabase/baseline.sql` com `ON_ERROR_STOP=1`; nenhuma migration aplicada
individualmente. A primeira tentativa sem extensões falhou com `public.vector`
ausente; o preparo correto seguiu o `install.sh`, sem alteração de schema no repo.

O dono foi criado por `scripts/bootstrap-owner.ts`. O wrapper `run.mjs` monta o
ambiente do zero: Resend e chaves opcionais de IA/retorno oficial ausentes. As
variáveis OBRIGATÓRIAS de transporte e Redis apontam para serviços locais
indisponíveis; não se alegou que eles funcionassem. O Next foi compilado e
iniciado em modo de produção na porta 3012, não em dev.

Os testes usam somente a conta fictícia `dono-p0@example.test`. Senha e segredos
efêmeros foram gerados em arquivo local ignorado, NÃO incluído no arquivo de
evidências. O log de inicialização do Supabase, que imprime credenciais locais,
também foi excluído. Não há credenciais nem dados de clientes neste pacote.

## Resultados observados

| Prova | Resultado |
|---|---|
| Regressão antes do código (`conexao-red.log`) | 4 falharam, 1 passou. Guard/ausência de conexão eram a causa. |
| Recorte depois do código (`conexao-green.log`) | 17 passaram. |
| Mensagem de conexão (`estado-red.log`) | 1 falhou, 9 passaram antes do ajuste da mensagem. |
| Recorte com compatibilidade positiva (`revisao-green.log`) | 42 passaram em 6 arquivos. |
| Sabotagem posterior (`sabotagem-conexao.log`) | Guard antigo reinserido: 2 falharam, 5 passaram; guard removido novamente. |
| Banco (`base-db.log`) | INSTALL e UPDATE passaram; 164 arquivos, 1.350 passed e 1 skipped; exit 0. Nenhum arquivo de banco foi alterado depois. |
| Build (`fresh-build.log`) | `next build`, exit 0. |
| Entrada sem IA (`fresh-ui.log`) | 1 teste Playwright passou, 10,5 s de suíte. |
| Geração sem chave (`fresh-flows-ui.log`) | 1 teste Playwright passou, 16,9 s de suíte; 0 fluxos antes e depois. |
| Verificação final (`p0-gov-final-isolado.log`) | `corepack pnpm gov:verify`, exit 0; typecheck/lint/lint:channels/lint:role-rank e 745 arquivos, 7.837 testes passed. Vitest 246,54 s. Lint: 310 warnings, zero erros. |

Na conexão: `scrollWidth` = viewport em 1440, 768 e 390 px. Também foram medidas
as caixas e estilos dos elementos do conteúdo. No diálogo de geração: largura
interna/rolagem = 510/510, 510/510 e 388/388, respectivamente. Consulte os JSONs;
screenshots não substituem as medidas.

Após o caminho humano: estado persistido continha apenas `welcome`, zero agentes,
`onboarded_at=null`. A tentativa de QR criou um canal `STARTING`, com
`ai_gate=allowlist`, `ai_gate_mode=pre_go_live` e lista de testes vazia. Foi uma
tentativa FALHA de transporte, não um número pareado nem mensagem enviada.

## Erro de preparação não ocultado

`p0-gov-final.log` é uma rodada VERMELHA: 7.837 testes passaram, mas uma suíte
extra falhou. O script local de Playwright tinha sido colocado fora de
`tests/e2e` e foi coletado pelo Vitest. Ele foi movido para
`.superpowers/fresh-p0/tests/e2e/`, usando a exclusão existente `**/tests/e2e/**`.
Nenhuma configuração de gate foi afrouxada. `coleta-final.log` confirma ausência
dessas specs na coleta unitária. Não use a linha Tests isoladamente para chamar
a rodada antiga de verde: a linha Test Files e o exit eram vermelhos.

## Limitações / continuidade

Revisão independente somente leitura: nenhuma regressão bloqueante encontrada.
A lacuna positiva apontada (referência válida ainda oferece ativação restrita)
foi coberta em `onboarding-conexao-sem-ia.test.tsx`, junto da preservação do estado
legado. Skills de TDD, verificação, worktree e revisão orientaram a separação dos
ambientes, o vermelho antes do código e a sabotagem posterior; não substituem as
medições listadas acima.

- Não medidos: estado individual das três organizações de produção; pareamento,
  envio e recebimento reais; compreensão de áudio; geração de IA com credencial
  válida; signup com confirmação de e-mail; suíte E2E completa; CI.
- P0 inteira NÃO concluída. O escopo entregue é o desbloqueio da conexão sem IA e
  a prova de falha clara de geração sem chave, comportamento que já existia.
- Visual das cinco áreas não iniciado. Há repetição de “Explorar o CRM” apontada
  pela revisão como polimento não bloqueante, sem correção neste recorte.
- Nenhuma mudança de schema: migration 0228 não criada. Baseline e MANIFEST intactos.
- Sem deploy, merge, PR ou acesso à VPS. Configuração local do dono preservada.
- Servidor Next e stack Supabase próprios foram parados; volume de teste preservado.

## Reprodução

O tar inclui os scripts locais, configuração do Supabase e configuração do
Playwright; não inclui `.env`, runtime.json nem chaves. São um registro do
instrumento usado, com caminhos desta máquina, não um novo instalador do produto.
O caso `proof` pressupõe banco FRESCO; não executá-lo sobre organização já usada.
Os comandos do wrapper são `bootstrap`, `build`, `server`, `test` e `flows`, sempre
com Node 22 e pnpm 9.15.9. A prova principal dos gates está em OUTRA branch:
`codex/prova-gates-principal`, SHA `fed7e4e49`.
