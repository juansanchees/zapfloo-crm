# Auditoria adversarial — anexos 3 a 6

Branch: `codex/correcoes-anexos`, derivada de `codex/correcoes-producao` @ `f920dac5e`.
Escopo: somente os quatro defeitos; nenhuma alteração na main, PR, publicação ou VPS.

## Contratos corrigidos

| Anexo | Contrato | Prova direcionada |
|---|---|---|
| 3 | Cliente do Copiloto aguarda até 50s e não repete POST custoso automaticamente. | `copilot-page.test.tsx`: resposta simulada após 12s aparece e há um único POST; indisponibilidade também não repete. |
| 4 | Recuperação explícita por admin, com tenant e CAS; conserva texto/agente antigo, limpa ponteiros e prova obsoleta. | `onboarding-recuperar-preparacao.test.ts`: arquivar/apagar → recuperar → preparar; recusa cross-tenant, revisão antiga e agente em uso. Actions/leitura/UI têm testes separados. |
| 5 | Ensaio consta do registro; scanner não depende do tipo de aspas. | `pontos-de-ia-completude.test.ts` e sabotagem em arquivo real, não só regex isolado. |
| 6 | SAVE e PREPARE respeitam o prompt composto total de 20.000 unidades UTF-16. | Fronteiras 20.000/20.001, três templates, contexto, emoji, letra `v` e tab vertical em TypeScript/Postgres. |

Precisão do anexo 5: `onboarding_rehearsal` já passava pelo orçamento do seam e por `llm_calls`. Faltava no inventário. Continua **fixo**: a seleção explícita do ensaio prevalece; não se promete um override de roteamento que o runtime ignoraria.

## Schema

- 0228: `20260910141154_0228_onboarding_recover_preparation.sql`.
- 0229: `20260910141734_0229_limite_exato_prompt_onboarding.sql`.
- Ambos espelhados integralmente em `supabase/baseline.sql`, **antes** da varredura final de anon, e registrados em `supabase/migrations/MANIFEST.md`.
- Função pública nova e funções substituídas são invoker, com revogação de PUBLIC/anon/authenticated e concessão a service_role. Helpers de composição/UTF-16 ficam no schema privado.
- Nenhuma migration aplicada foi editada; 0230 não usada e 0231 não tocada.
- Tipos de `public` regenerados pela CLI contra o banco fresco: somente 9 linhas novas da RPC de recuperação. `graphql_public` e `storage` preservados byte a byte, sem edição manual dos tipos.

## Living System Checklist

| Pergunta | Resposta concreta |
|---|---|
| Entrada e saída | Copiloto: pergunta → `/api/v1/ai/ask` → resposta/erro no componente. Onboarding: formulário + contexto confiável → rascunho/versão inativa → painel de ensaio. Registro: `executar-ensaio.ts` → seam → `llm_calls`. |
| Atividade e tela | Recuperação grava `onboarding.preparation_recovered` com revisão/IDs, sem conteúdo. Consulta existente `/app/audit` lê `api_audit_log` por organização. Ensaio continua visível no painel e nas execuções de IA. A consulta de auditoria foi inspecionada em código; não é uma nova timeline de conversa. |
| Porta | Painel existente `/onboarding/setup-ai` e Copiloto existente. Não foi criada rota nem mecanismo paralelo de navegação. |
| Anti-morte | Recuperar preparação; se nome ocupado, escolher outro e salvar; se texto excede teto, reduzir sem perder campos; Copiloto conserva erro visível sem POST repetido. |
| Configuração | Nome, objetivo, regras, modelo e credencial continuam no mesmo formulário. Recuperação não configura/chama IA nem ativa atendimento. |
| Continuidade IA ↔ humano | Este recorte é preparatório: nenhuma conversa de cliente ou handoff é iniciado. Aprovação antiga deixa de valer ao recuperar; nova preparação/ensaio/revisão continuam explícitos. |
| Laço de retorno | Falha preserva texto e orienta correção humana; nova gravação altera revisão e próxima preparação. Não há aprendizagem automática nem ação ilustrativa. |
| Mapa vivo | `onboarding-preparacao.architecture.json` inclui recuperação e audit; `onboarding-rascunho.architecture.json` inclui teto montado e retorno para correção. |

## Revisão e sabotagens

- Timeout do Copiloto reduzido: teste de 12s vermelho, restauração verde.
- Limpeza de `prepared_revision` desativada no baseline: 3 regressões de recuperação vermelhas; restauração aplicada.
- Action de recuperação tornada indisponível: seus 5 testes vermelhos; restauração e 11 testes de action/leitura/UI verdes.
- Ponto novo em aspas duplas inserido em produção: varredura vermelha; sonda removida.
- Limite SQL afrouxado em uma unidade: log final com exit 1, 4 testes falhando e 37 passando; restauração com exit 0 e 41/41 passando. Hashes do baseline e da migration restaurados exatamente.
- Revisão independente encontrou e corrigiu: arquivamento após mudança de revisão; exclusão com página aberta; escape PostgreSQL `\v` (letra v) substituído por `\013` (tab vertical). Os novos casos reproduziram falha antes da correção.

## Verificação integral

Executado neste **worktree**, não no checkout principal. Node 22, pnpm 9.15.9 via corepack; logs em `.superpowers/evidence/anexos-3-6/`.

- `corepack pnpm test:db`: **exit 0**, 167 arquivos; **1.374 passaram, 1 pulado**. Baseline INSTALL e UPDATE, guard de árvore estática e teardown concluídos. O skip preexistente é `webhooks-inbound.test.ts:539`, teste de rate limit 429 delegado à cobertura unitária.
- Primeira execução integral de `corepack pnpm gov:verify`: **exit 0**, 748 arquivos / 7.866 testes. A varredura ainda recebeu revisão durante essa corrida; por isso foi iniciada uma repetição com os arquivos congelados, não se usa esse resultado sozinho como prova do estado final.
- Build otimizado E2E: exit 0. Caso Copiloto no Chromium: 1 passou, resposta HTTP controlada atrasada 12 segundos, um POST; não mede fornecedor de IA nem faturamento real.
- Repetição congelada de `corepack pnpm gov:verify`: **exit 0**, **748 arquivos / 7.867 testes**, zero falhas. Typecheck, lint (310 warnings existentes, zero erros), canais (62 arquivos de dívida, nenhum novo) e role-rank passaram.
- Depois dessa corrida, foram acrescentadas apenas a entrada gerada de tipos da RPC, quatro traduções em espanhol e anexos de medição E2E. Nova verificação: typecheck exit 0; lint direcionado exit 0; registro/idioma/espanhol **37/37**. Não se alega outra corrida integral posterior a esses ajustes.
- `E2E_PORT=3218 corepack pnpm exec playwright test tests/e2e/redesign-operacional.spec.ts --project=chromium`: **4/4 passaram**.
- `E2E_PORT=3218 corepack pnpm exec playwright test tests/e2e/onboarding-ativacao-restrita.spec.ts --project=chromium` com o preload sintético canônico: **3/3 passaram**, incluindo PT-BR e espanhol. HTTP de IA fica em localhost; não é validação do fornecedor real.
- Recuperação também executada isoladamente **sem chave de IA nem Resend**: **1/1 passou**. Banco fresco via baseline + bootstrap, dados fictícios. Arquivamento → botão de recuperação → novo preparo; agente antigo permaneceu inativo e nenhum atendimento foi ativado. Larguras 1440/768/390: documentScrollWidth igual à largura da janela; botão com largura 170,14px e fonte 14px por DOM, além dos screenshots.

## Fechamento

| Concluído e testado | Pendente | Bloqueado |
|---|---|---|
| Quatro correções em `codex/correcoes-anexos`; código até `044e5d112`. Provas: gov:verify, test:db, duas specs E2E e sabotagens descritas acima. | Revisão e integração da branch; aplicação em produção somente em outro lote autorizado. | Nenhum bloqueio restante para este recorte. |
| Tripla 0228/0229, quatro fragmentos e mapas de arquitetura/jornada atualizados. | Não inclui trabalho visual ou outras funcionalidades. | CI remoto e produção não foram usados como aceite; permanecem não medidos. |

Os três commits de código foram enviados ao origin; documentação e evidências são salvas em um quarto commit dedicado. Não foi aberto PR, cortada release ou executado deploy. O dry-run de fragmentos sugeriu 1.18.0 sem escrever release.

O primeiro E2E de recuperação falhou por seletor do harness (`/E-mail/` versus rótulo real `Email`); foi alinhado ao seletor já usado pelos demais cenários, `/e-?mail/i`. Não foi alterado o produto para satisfazer o teste.

## O que não foi medido

- VPS, deploy, aplicação destas migrations em produção e CI remoto.
- Faturamento/latência de um fornecedor real, credenciais de clientes e transporte real de WhatsApp. O teste de 12s usa resposta HTTP controlada; os cenários completos usam provedor sintético local.
- Suíte E2E inteira do repositório, Safari/Firefox e dispositivos físicos. Foram executadas integralmente as duas specs tocadas, em Chromium.
- O skip preexistente de rate limit nos invariantes não foi habilitado. A proteção específica continua fora desta prova de banco.
- Estes gates foram executados no worktree próprio; não se alega nova medição no checkout principal.

O primeiro `gov:verify` não chegou à suíte: seu `pnpm` interno encontrou o fallback global de outra versão. Foi gerado um shim temporário com `corepack enable`; a repetição usa Node 22 e pnpm 9.15.9, sem mudar dependências do projeto.

Não houve baseline unitário limpo antes de todas as edições: a primeira corrida já coletou o novo teste vermelho de 12s. Não é apresentada como prova da branch base.
