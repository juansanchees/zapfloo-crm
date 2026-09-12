# Tema claro no primeiro acesso — 12/09/2026

Branch `codex/tema-claro-padrao`, criada de `origin/main` em `5cd59cb14`.

## Contrato

Sem preferência salva, o script inline e o `ThemeProvider` resolvem para claro.
Valores explícitos `light`, `dark` e `system` continuam preservados. Apenas
`system` acompanha o sistema operacional. Nenhuma leitura grava uma escolha
no armazenamento. Os arquivos da sidebar, dos tokens e do seletor não mudaram;
o provedor corrige também a sincronização do seletor após hidratar. Sem schema.

O script permanece síncrono no `<head>`, antes do conteúdo. Os testes de
navegação e redesign que mediam escuro via sistema agora escolhem `system`
explicitamente e conferem o atributo, mantendo a cobertura real do tema escuro.

Uma premissa foi corrigida na prova, não no produto: o fundo da sidebar já usa
dois tons escuros, via `--color-shell` (`app/globals.css:260/342`). A nova
asserção de igualdade de RGB reprovou indevidamente. A prova passou a medir
fundo escuro e contraste do texto claro nos dois temas. CSS, cores da marca
e sidebar foram preservados, inclusive essa pequena diferença preexistente.

## Reprodução e sabotagem

- Antes da correção: `tema-padrao.test.tsx`, **5 falhas / 12 aprovados**;
  os casos acusam o padrão antigo no script, no cliente e no servidor.
- A correção inicial passou os 17 testes. No navegador, porém, **7 passaram e
  1 reprovou**: após reload, DOM, armazenamento e fundo estavam escuros, mas o
  botão conservava `Tema: light` e o ícone renderizado pelo servidor. Diagnóstico
  em `.superpowers/evidence/tema-padrao/diagnostico-reload.json`.
- Um teste adicional com `hydrateRoot` e o `ThemeToggle` real reproduziu esse
  defeito: **1 falha / 17 aprovados**. O provedor agora usa o marcador de
  hidratação já empregado em `CampoDeLogo`, mantém o primeiro render compatível
  com o servidor e só depois expõe a preferência salva aos consumidores.
- Sabotagem: retirar `if (!hydrated) return` do efeito reprovou o teste de
  hidratação (**1 falha / 17 aprovados**), porque escreveu `light` sobre o `dark`
  do script antes de voltar a `dark`. Restaurada a guarda: **18 aprovados**,
  exit 0. Nenhuma exceção de hidratação foi suprimida no produto.

Logs locais: `/private/tmp/tema-red.log`, `tema-hidratacao-red.log`,
`tema-sabotagem-guarda.log` e `tema-unit-restaurado.log` (mesmo diretório).

## Verificação final

- Node 22 e `corepack pnpm`, no worktree isolado desta branch.
- Lint completo: exit 0, **0 erros / 309 avisos**, nenhum nos arquivos alterados.
- `corepack pnpm typecheck`: exit 0.
- `corepack pnpm lint:channels` e `corepack pnpm lint:role-rank`: exit 0.
- `corepack pnpm test:unit --maxWorkers=4`: exit 0; rodapé **754 arquivos / 7.888
  testes aprovados**, zero registros `FAIL`, duração 589,70 s. Não é apenas
  `tests/unit/`: é o script integral do repositório. A primeira tentativa
  restrita foi interrompida por bloqueio dos servidores HTTP/DNS usados pela
  suíte; esta execução final permitiu as operações locais necessárias.
- `corepack pnpm exec next build --webpack`: exit 0, compilação de produção
  local com `.env.e2e` gerado e validado para Supabase local em `127.0.0.1:57521`.
  Nenhuma chave de IA real foi usada. O teste não exige IA nem envio de mensagens.
- `corepack pnpm release:conferir`: exit 0; fragmento `nada_mudou/alterado`
  reconhecido. Somente conferência, nenhuma versão/release foi escrita.
- Playwright: **8 aprovados, zero skips, exit 0, 1,4 min**. Comando:

```sh
E2E_PORT=3150 corepack pnpm exec playwright test \
  tests/e2e/tema-padrao.spec.ts tests/e2e/navegacao.spec.ts \
  tests/e2e/redesign-operacional.spec.ts \
  --grep 'padrão claro|visão geral usa dados locais reais|o sistema operacional preserva hierarquia' \
  --reporter=list
```

Os seis casos novos cobrem quatro preferências iniciais, JavaScript de
hidratação bloqueado e a sequência real seletor → dark → reload → armazenamento
forçado dark → reload → apagar preferência → light → system → mudar SO → reload.
Os dois casos existentes preservam a cobertura de navegação/tema em desktop,
tablet e 390px. A prova de primeira pintura usa Chromium em 1280×720, contexto
novo, SO em escuro, `MutationObserver`, `requestAnimationFrame`, Paint Timing
e `getComputedStyle`. O banco de testes foi reutilizado; não se afirma aqui
uma instalação fresca completa nem uma nova validação de onboarding.

### Primeira pintura — medições finais

Tempos em ms desde a navegação. A coluna de registro é a **última observação**
antes da primeira pintura, não uma medição de desempenho do produto. Todos os
quadros observados de cada caso tiveram somente o tema e o fundo esperados:
**239 quadros, nenhum com cor divergente**.

| Caso / arquivo JSON | Tema | Registro pré-pintura | Primeira pintura | Quadros |
|---|---|---:|---:|---:|
| `inicio-novo` | light | 66,5 | 88 | 39 |
| `inicio-dark` | dark | 55,7 | 68 | 27 |
| `inicio-light` | light | 60,3 | 72 | 22 |
| `inicio-system` | dark | 44,7 | 60 | 20 |
| `antes-da-hidratacao` (chunks JS bloqueados) | dark | 49,9 | 64 | 14 |
| `escuro-apos-reload` | dark | 5.523,9 | 5.532 | 61 |
| `claro-apos-limpar` | light | 1.860,5 | 1.868 | 19 |
| `sistema-apos-reload` | dark | 1.658,7 | 1.680 | 37 |

Fundo claro medido: `rgb(250, 249, 252)`; escuro: `rgb(17, 17, 20)`.
Na sidebar, o contraste do texto-base branco com o fundo foi **18,52:1** em
claro e **19,78:1** em escuro; isso não é auditoria de todo texto da sidebar.

Evidência local: `.superpowers/evidence/tema-padrao/` (JSON de cada linha e PNG),
mais `sidebar-light.json` e `sidebar-dark.json`. São contas e marca do ambiente
de testes, não a produção. As provas executáveis estão versionadas na spec e
incluídas no CI via `SPECS_PARTE_1`.

Logs finais em `/private/tmp/`: `tema-unit-final.log`, `tema-build-final.log`,
`tema-typecheck-aceite.log`, `tema-lint-aceite.log`, `tema-gates-final.log` e
`tema-e2e-aceite.log`. Revisão independente do provedor e da régua: sem achados
bloqueantes. `git diff --check`: exit 0.

## Living System Checklist

- Entrada: `localStorage` e `prefers-color-scheme`, nos mecanismos existentes.
- Saída/tela: `data-theme` em `<html>`, consumido pelos tokens de `app/globals.css`
  e por `useTheme()`; afeta login e todas as telas sob o layout raiz.
- Configuração/porta: `ThemeToggle` existente no menu do usuário; conserva três
  opções. Nenhuma rota nova.
- Atividade: preferência local do navegador; não é mutação de negócio e não
  gera evento/auditoria no servidor.
- Anti-morte/retorno: claro quando a preferência falta ou não pode ser lida;
  escolha manual substitui o padrão e é reutilizada no próximo carregamento.
- Continuidade IA/humano: não se aplica; nenhuma ação de atendimento alterada.
- Mapa: nenhuma peça arquitetural nova; os consumidores existentes permanecem.

## O que não foi medido

- Publicação/produção, CI remoto, suite E2E inteira e navegadores diferentes do
  Chromium. Não se declara ausência de pisca em plataformas não exercitadas.
- Banco/RLS: não exercitados nesta entrega, que não muda schema, acesso ou dados.
- Os logs do navegador registraram avisos do Supabase sobre `getSession()` e
  `The destination stream closed early`; não houve falha nos oito casos finais.
  A causa desses avisos não foi investigada nesta tarefa de tema.

## Fechamento

| Concluído e testado | Pendente | Bloqueado |
|---|---|---|
| Default claro, preferências preservadas, hidratação sem pisca observado, seletor e sidebar preservados; provas acima na branch `codex/tema-claro-padrao`. | Revisão/merge e publicação são etapas posteriores, fora desta entrega. Nenhum deploy ou PR realizado. | Nenhum impedimento para a alteração local. Limites de medição estão discriminados acima. |
