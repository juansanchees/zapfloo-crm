# Relatório — simplificação da primeira impressão

Data: 12/set/2026  
Branch: `codex/simplificacao-urgente`

| CONCLUÍDO E TESTADO | PENDENTE | BLOQUEADO |
|---|---|---|
| “Explorar o CRM” não captura mais o redirecionamento do Next como erro. Falhas esperadas voltam por código seguro, transporte mostra orientação distinta e a telemetria nunca recebe a exceção crua. | Nenhuma mudança funcional desta leva ficou pela metade. | O `next build` padrão (Turbopack) não pôde abrir o socket interno do processador CSS neste ambiente (`Operation not permitted`). O mesmo código compilou com `next build --webpack`; o CI ainda deve medir o compilador padrão. |
| O título dos guardrails agora explica que são conferências antes do envio; a lista e as travas continuam intactas. |  |  |
| “Agents” foi corrigido para “Agentes”, com tradução espanhola. |  |  |
| O cartão do agente deixou de expor `mcp_agent`, prioridade e id cru do modelo; nome, descrição, estado e ações foram preservados. |  |  |

## Provas

- TDD e sabotagem: retirar `unstable_rethrow` torna a prova comportamental do redirecionamento vermelha; restaurado, os testes focados passam.
- `corepack pnpm typecheck`: exit 0.
- `corepack pnpm lint`: exit 0, 309 avisos preexistentes e zero erros.
- `corepack pnpm test:unit`: 755 arquivos, 7.876 testes, zero falhas.
- `corepack pnpm lint:channels`: 62 arquivos de dívida conhecida, nenhum novo.
- `corepack pnpm lint:role-rank`: exit 0.
- `corepack pnpm release:conferir`: fragmento válido, próxima versão calculada como 1.18.1.
- `next build --webpack`: exit 0.
- Playwright `troca-de-organizacao-tem-volta`, caso do administrador pendente: 1 passou; mede entrada, recarga, 1280 px e 390 px.
- Playwright `wizard-do-funcionario` completo: 5 passaram; mede a sequência serial e o novo título.

## Living System Checklist

- Evento observado: nenhuma emissão operacional nova; a mudança corrige navegação e apresentação.
- Estado persistido: somente o cookie já existente de exploração; `onboarded_at` continua nulo.
- Erros visíveis: sessão, organização, acesso, MFA, servidor e rede têm mensagens distintas.
- Log seguro: servidor registra apenas código canônico; navegador envia apenas erro canônico à telemetria.
- Recuperação: usuário pode tentar novamente, autenticar-se ou retomar a configuração.
- Multi-tenant: a ação continua usando o par autenticado retornado por `requireOnboardingCtx`.

## O QUE NÃO FOI MEDIDO

- O envio real a um projeto Sentry externo; a prova cobre o payload produzido e a ausência da sentinela sensível.
- Produção e dados de cliente; toda prova de navegador usou Supabase local isolado.
- O compilador Turbopack fora da restrição de sockets deste ambiente; fica para o CI da branch/PR.
