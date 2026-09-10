# Ajuste dirigido de preparação do teste de recuperação

Re-review de `2635081cc..629165e40`: os quatro findings anteriores estão
addressed no produto. Única nova quebra Important: o E2E espera setup-ai para B,
mas B ainda não concluiu welcome. `SetupAiPage:38` corretamente redireciona.

Ownership do executor original: somente
`tests/e2e/troca-de-organizacao-tem-volta.spec.ts` e apêndice no
`final-fix-report.md`. Não alterar produto, outras specs, schema, banco, env,
infra ou limites/timeouts para esconder falha. Não há agente concorrente nesses
arquivos, mas documentos do root continuam intocados. Sem subagentes/push/PR.

Sequência correta, com controles reais:

1. Manter conflito A→B, medição390 e prova de zero mudança/audit em B.
2. Clicar Recarregar esta etapa e exigir `/welcome`.
3. Confirmar boas-vindas pela tela (checkbox e Continuar), exigir conexão.
4. Abrir Configurar IA (opcional), verificar Nome exclusivo B.
5. Adiar e exigir `/connect-whatsapp`, pois B não tem conexão.
6. Preservar auditoria+1, skipped e rascunho sem alteração; retorno para A mantém
   a cobertura existente. Não inserir marcas manualmente nem navegar diretamente
   para contornar o link que está sob teste.

Root só despacha após encerrar gates congelados. R4 será preservada como
vermelha, não substituída pelo log posterior. O root repetirá E2E com os demais
gates encerrados: houve 504 local no caso negativo e timeouts não relacionados
no unitário durante execução concorrente. Não presumir causa ambiental sem a
reexecução isolada. Nenhum WhatsApp real será conectado.
