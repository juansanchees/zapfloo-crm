# Correção local — isolamento do teste legado

Base: `22620d85`, worktree `codex/onboarding-roxo`. Alterações anteriores
preservadas. Sem deploy, commit, push ou acesso à VPS/banco remoto.

## Causa e correção

A rota criava `is_dry_run=true`, mas a ponte MCP não recebia essa flag.
Somente o envio final era bloqueado. Agora a flag persistida bloqueia todos
os handlers na fronteira comum, inclusive leitura e handoff auto-injetado.
A recusa `dry_run_tool_blocked` com `executed: false` retorna ao modelo e fica
no trace. Início/fim não emitem eventos operacionais no dry-run.

O runtime guarda chamadas agrupadas por etapa; a tela só lia registros planos.
`RunTrace` agora suporta ambos, inclusive chamadas repetidas na mesma etapa.
O painel explica o limite em PT/ES antes da execução.

## Provas

- RED do isolamento: três regressões reproduzidas antes da mudança; controles normais passaram.
- RED do histórico: chamada agrupada não aparecia; caso adicional detectou chave React repetida.
- Testes direcionados após correção: oito casos passaram, incluindo handler normal, bloqueio de todas as ferramentas montadas e persistência da recusa.
- Verificação geral após ajuste do histórico: `gov:verify`, 713 arquivos e 7.649 testes, exit 0. Lint com zero erros e 313 avisos existentes no conjunto do worktree.
- Build local E2E passou, incluindo controle de URL local no bundle.
- E2E final: um caso Chromium passou (19,7s), com três chamadas HTTP ao receptor sintético local: ensaio novo, tentativa de ferramenta no legado e resposta após recusa. UI/trace persistido conferidos; zero mensagens, canais e eventos operacionais na organização de teste.
- Corte no celular reproduzido automaticamente (aviso ultrapassava viewport de 390px). Grid de uma coluna com largura mínima zero corrigiu o corte; nova medida e inspeção visual passaram. Evidências sintéticas em `.superpowers/evidence/ensaio/legado-isolado-{desktop,celular}.png`.
- Revisão independente: nenhum bloqueio de isolamento; chave repetida apontada e corrigida com regressão.
- Após o ajuste de layout: novo build, typecheck e 103 testes direcionados/arquitetura passaram, exit 0. `git diff --check` sem problemas.
- Ambiente Supabase local encerrado com volumes preservados; servidor de teste e receptor HTTP sem listeners ao final.

## Limites e operação

O teste continua consumindo modelo e gravando registros técnicos/auditoria.
Não comprova ferramentas, RAG, transporte ou resposta real a cliente.
O modelo ainda pode gerar texto incorreto apesar da recusa: não é uma garantia
de veracidade da resposta. Nenhum incidente em produção foi inferido.

O harness local apresenta avisos de serviços não configurados e o lint geral
tem avisos preexistentes (sem erros). Esses avisos não são prova de falha na
produção nem foram corrigidos fora deste escopo.

Sem schema novo ou mudança de migrations. Não remover a proteção para testar
operações: elas precisam de um ambiente isolado específico. O ensaio novo do
onboarding continua separado deste runtime.
As invariantes completas de banco não foram repetidas nesta correção sem SQL;
a prova E2E usou banco Supabase local real, sem alterar serviços remotos.

## Publicação e rollback

Correção ainda local. Próximo passo operacional: revisar e publicar somente uma
versão com os gates concluídos, preservando os demais lotes. Não fazer reset do
worktree. Se um rollback posterior reintroduzir o runtime antigo, suspender o
teste com ferramentas até restaurar a proteção; voltar silenciosamente à
versão vulnerável não é um rollback seguro.
