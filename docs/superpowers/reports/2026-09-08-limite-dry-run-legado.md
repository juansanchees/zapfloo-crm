# Limite de isolamento do teste legado

Data: 2026-09-08. Inspeção estática no worktree `codex/onboarding-roxo`, base
`22620d85`, com alterações locais preservadas. Nenhuma execução de IA ou envio
real foi realizado para esta análise.

## Diagnóstico original (antes da correção local)

- `app/api/v1/ai/agents/[id]/versions/[vid]/test/route.ts` cria uma execução
  `is_dry_run=true` e chama `runAgent` do runtime legado.
- `lib/ai/runtime/agent.ts:480` monta `pickToolsFromMcp` com os `tool_ids` da
  versão. A estrutura enviada não inclui a informação de dry-run.
- `lib/ai/runtime/tools.ts:36` não possui modo de isolamento em `PickToolsInput`.
  Em `:175`, após checagem de papel, escopo e funil, executa `def.handler`
  diretamente com o contexto do CRM.
- `lib/ai/runtime/agent.ts:647` usa `!run.is_dry_run` para impedir o envio da
  resposta final. Essa condição não envolve as chamadas de ferramentas.
- Há ferramentas reais de escrita no catálogo. Por exemplo,
  `lib/mcp/tools/messages.ts` contém `crm_send_whatsapp_message`, que chama
  `sendMessageHandler`. A disponibilidade de cada ferramenta depende da versão,
  das restrições do catálogo e das verificações de acesso; não é uma afirmação
  de que toda versão consegue usá-la.

## Consequência

`is_dry_run=true` não é, sozinho, uma fronteira que impede todos os efeitos de
ferramentas. A afirmação no cabeçalho da rota de que o teste nunca toca em
contatos/conversas nem chama WAHA é mais ampla que a proteção demonstrada pelo
caminho de execução. Isso não prova que houve envio ou alteração em produção;
nenhum incidente foi inferido a partir desta leitura.

O novo ensaio do onboarding não deve invocar esse runtime. Deve usar uma
chamada de texto sem tools, sem contato, sem canal e sem enfileirar mensagens,
com entrada capturada da versão preparada. A UI deve distinguir revisão de
texto de validação de ferramentas, RAG, guardrails completos e transporte.

## Correção local em 2026-09-08

A flag persistida agora chega à ponte MCP. Toda ferramenta montada retorna
`dry_run_tool_blocked` e `executed: false` antes de chamar qualquer handler,
inclusive ferramentas de leitura e handoff auto-injetado. Eventos operacionais
de início/finalização não são emitidos em dry-run; registro técnico, auditoria
e consumo do modelo permanecem. O modo normal conserva a execução autorizada.

A regressão foi reproduzida antes da correção (três falhas) e os testes
direcionados passaram após a proteção. A UI informa que o teste não comprova
operações reais. Isso não garante que o texto do modelo respeite a recusa.
Correção somente local, ainda não publicada. O ensaio novo permanece separado.
