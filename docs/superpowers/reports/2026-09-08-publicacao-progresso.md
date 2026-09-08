# Publicação Zapfloo — execução em andamento

Autorização: usuário pediu concluir onboarding, revisar banco, executar gates completos, preparar alternativa ao GitHub pago e publicar após validação. Backup externo do código ficou a cargo do usuário. Isto não dispensa proteção de recuperação antes de alterar produção.

Base local: `f6842739`, branch `codex/onboarding-roxo`, árvore limpa no início. Sem push/Actions, plano pago ou mudança de visibilidade. Não abrir `.env*`; não enviar mensagens reais ou ativar atendimento de contatos como parte dos testes.

## Estado

- `pnpm gov:verify` da base: exit 1, 712 arquivos verdes, um falhou; 7648 testes passaram, quatro falharam nos vínculos de evidência. Log `/tmp/zapfloo-publicacao-baseline-gov.log`.
- Identificadas quatro falhas no gate de evidências após o checkpoint: citações incompletas e imagens sem citação individual. Investigar e corrigir os documentos, sem remover o gate.
- Supabase local retomado (exit 0) dos volumes do projeto `zapfloo-onboarding-e2e` em `/tmp/zapfloo-onboarding-e2e.KooVaP`. Configuração existente é Postgres 17; teste de invariantes usa separadamente o piso pg15.
- Tipos regenerados para comparação com schemas `public,graphql_public`: 28 linhas adicionadas, somente restauração do schema GraphQL omitido pela geração anterior.
- Mapeamento somente leitura de conexão/autorização em paralelo. Nenhuma implementação de fluxo iniciada ainda.

## Pendências de saída

1. Corrigir os vínculos de evidências e provar o gate.
2. Concluir jornada aprovada em `2026-09-08-primeiro-acesso-roxo.md`, preservando separação entre ensaio, conexão e ativação.
3. Reconciliar tipos gerados e validar migrations no banco local.
4. Executar testes completos no candidato estável, build, E2E/visual e imagens amd64.
5. Preparar procedimento privado sem Actions pago, com procedência, imagens imutáveis e rollback; não tratar exceção local como release oficial do upstream.
6. Conferir estado real e recuperação da VPS antes de atualizar. Não declarar publicado antes de confirmar domínio e fluxos.

## Índice de evidências anteriores

As capturas sintéticas já versionadas `evidence/onboarding/estrutura-desktop.png` e `evidence/onboarding/estrutura-celular.png` documentam a estrutura responsiva inicial. `evidence/onboarding/explorar-desktop.png` e `evidence/onboarding/explorar-celular.png` documentam a saída de exploração. São evidências dos lotes anteriores, não prova de que a jornada final ou a produção já foram validadas.
