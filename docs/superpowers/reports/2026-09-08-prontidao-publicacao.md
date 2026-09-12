# Revisão de prontidão para publicação — Zapfloo

Data: 2026-09-08. Resultado: **não liberar publicação ainda**.
Escopo: inventário do lote, contratos de release e evidências disponíveis;
não é auditoria linha a linha de todos os arquivos nem prova em produção.

## Estado conferido nesta revisão

- Worktree: `.worktrees/onboarding-roxo`, branch `codex/onboarding-roxo`.
- HEAD: `22620d85b4023e9975d7dbfd673e9b8bd9393b96`. Após `git fetch origin`,
  comparação com `origin/main`: zero commits à frente e zero atrás.
- Antes deste relatório: 43 arquivos rastreados modificados e 70 não rastreados
  (113 no total). Nada staged/commitado nesta revisão. Outros worktrees preservados.
- Repositório explicitamente consultado: `juansanchees/zapfloo-crm`, **privado**.
  `gh repo view` sem `--repo` resolveu o upstream público; por isso consultas
  remotas seguintes usaram o nome próprio explícito. Não usar defaults para push/PR.
- `pnpm release:conferir`: exit 0, oito fragmentos, cálculo `1.17.0 + minor = 1.18.0`.
  É previsão, não versão criada: nenhum fragmento consumido, tag ou release publicada.
- As quatro migrations 0220–0223 têm texto integral presente no baseline e entrada
  no MANIFEST. Conferência estática; nenhuma migration foi aplicada nesta revisão.
- `git diff --check`: exit 0. Sem alterações de Dockerfiles/compose/setup kit no lote.

## Bloqueio externo confirmado

Run da base atual:
[E2E 34236129146](https://github.com/juansanchees/zapfloo-crm/actions/runs/34236129146).
As três partes da matrix terminaram com sucesso; o agregador `e2e` falhou sem
iniciar steps. A anotação do check `102104229083` informa falha recente de
pagamentos **ou** necessidade de aumentar o limite de gastos. Não é uma falha
de teste diagnosticada e não permite escolher qual das duas causas ocorreu.

O responsável precisa conferir **Settings → Billing & plans** no GitHub.
Não houve mudança de plano, cobrança, limite, visibilidade ou retentativa do CI.
Depois da regularização, repetir o job/run e exigir conclusão verde.

A consulta de proteção da `main` retornou HTTP 403 pedindo GitHub Pro ou
repositório público para esse recurso. **Manter privado**; não tornar público
para contornar a limitação. A proteção descrita nos documentos do upstream
não é evidência de proteção ativa neste fork. Até resolver a governança,
nenhum merge com check ausente, pulado ou vermelho deve ser tratado como seguro.

CI, perf e publicação de imagem da base têm runs bem-sucedidos. Não validam
os 113 arquivos locais: eles ainda não existem em um commit candidato no GitHub.

## Composição e limites do lote

| Grupo | Conteúdo | Condição antes de integrar |
|---|---|---|
| Correções operacionais | agenda, STOP/follow-up, guards de onboarding e dry-run | manter regressões próprias; não misturar com mudança de modelo em produção |
| Configuração preparatória | exploração, rascunho, preparação inativa, ensaio/revisão | migrations 0220–0223 + baseline + MANIFEST + tipos gerados acompanham os consumidores |
| Interface e evidências | estrutura inicial, avisos, histórico e responsividade | revisar imagens antes de commit; só fixtures sintéticos, sem dados reais |
| Harness/documentação | regressões, receptor HTTP local, opt-in Playwright, mapas | preservar fronteira sintética; não apresentar resposta fake como prova de integração externa |

Os relatórios anteriores registram 7.649 testes unitários, build e E2E direcionado
aprovados; o lote de ensaio registra 1.301 invariantes aprovados e um skip.
**Não foram repetidos nesta revisão**. Não equivalem a CI do futuro commit nem
a suíte E2E inteira. Lint tem avisos, não uma saída sem pendências.

Pontos que não devem desaparecer no anúncio de release:

- O wizard completo com conexão/autorização explícita do atendimento ainda não
  é provado pelo ensaio. Não anunciar o redesign inteiro como concluído.
- Ensaio sintético não prova IA externa, RAG, WAHA/Meta ou entrega a cliente.
- O caso sintético depende de opt-in; o workflow atual não ativa
  `E2E_ONBOARDING_SYNTHETIC_PROVIDER`. Sua prova local deve acompanhar a revisão.
- `FORA_DO_CI` lista `vps-fresh-onboarding`, `inbox-tempo-real` e
  `cadastro-sem-confirmacao-de-email`: CI verde não prova essas jornadas.
- O diff gerado de `lib/database.types.ts` inclui mudanças além das quatro
  migrations (inclusive remoção de `graphql_public`). Reconciliar geração com
  o schema/versão do gerador do candidato; não aparar o arquivo à mão.

## Sequência segura recomendada

1. Regularizar o bloqueio de faturamento/limite do GitHub e confirmar a estratégia
   de proteção da branch privada, sem alterar visibilidade.
2. Definir o commit candidato com os grupos acima e revisar o diff completo,
   especialmente tipos gerados e imagens. Não usar `git add .` no lote acumulado.
3. Repetir sequencialmente `gov:verify`, `test:db` e build/E2E relevantes no
   candidato estável; preservar logs e contabilizar skips como lacunas.
4. Com autorização de integração, commit/branch/PR no repositório próprio.
   Exigir `verify`, `invariants`, `build-and-size`, `e2e` e `imagens-ok` no SHA
   exato. Não substituir esses checks por resultados da base.
5. Somente depois, merge/release via CI com imagens versionadas. Conferir o
   cálculo de versão novamente; não digitar nem mover tags manualmente.
6. Publicação na VPS é etapa separada: verificar estado/backup/restauração e
   compatibilidade do Supabase externo, atualizar pelo runbook da instalação,
   preservar proxy/labels e validar domínio + fluxos. Não copiar caminhos do
   runbook upstream como se fossem caminhos confirmados desta VPS.

## Rollback e testes de produção futuros

Registrar antes da atualização a versão/digests dos três serviços próprios e
o backup do banco com prova de restauração em ambiente isolado. As migrations
aditivas e os rascunhos não devem ser apagados para reverter a interface.

Se houver falha, suspender ativação e reverter imagens para uma versão
comprovadamente compatível. Se ela reintroduzir o dry-run vulnerável, suspender
o teste com ferramentas até restaurar a proteção. Não emitir mensagens de
teste para contatos reais, não ativar atendimento automaticamente e não
desconectar o número como parte de uma validação de interface.

Smoke futuro: domínio/login, organização correta, salvar/retomar rascunho,
preparar sem canal, resposta/erro honesto, revisão invalidada ao editar,
dry-run com recusa visível, ausência de envios e integridade das filas existentes.

## Encerramento

Esta etapa entregou a revisão e o plano de integração, não a publicação.
Nenhum código, env, banco, VPS, commit, push, PR, workflow, plano ou modelo
de produção foi alterado. Próxima ação depende do responsável: resolver a
restrição apontada em Billing & plans; depois fechar o candidato e seus gates.
