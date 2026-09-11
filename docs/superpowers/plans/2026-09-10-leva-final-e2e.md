# Leva final E2E — diagnóstico preservado e próximos passos

> **For agentic workers:** execução com investigação sistemática, TDD e revisão independente. Agentes auditam domínios disjuntos; o coordenador serializa builds, browser e banco.

**Goal:** atribuir e corrigir os casos restantes sem substituir erros reais por falhas de limpeza nem relaxar os oráculos.

**Architecture:** preservar AppShell/editor já corrigidos; separar teardown, configuração de gatilho e navegação contextual do agente. Os demais casos recebem diagnóstico de runtime antes de qualquer mudança.

**Tech Stack:** Node 22, pnpm 9.15.9, Next.js 16/React 19, Playwright Chromium, Supabase local.

**Spec:** pedido do dono “LEVA FINAL”, 10/set/2026. A lista contém sete nomes de teste, apesar de anunciar seis falhas: caso, etapa, silêncio, wizard, espanhol, degradação e agente novo. A unidade de acompanhamento será o nome do caso.

## Restrições

- Branch `codex/altura-shell`, PR #7; base conferida por fetch/FF em `003994ec1`.
- Não tocar main, VPS, `.env*`, `.codex/config.toml` ou specs da Leva B.
- Nenhuma alteração de schema planejada. Se necessária, interromper para delimitar a correção e aplicar a tripla.
- Uma execução pesada por vez; ambiente QA local 57421/57422 e app 3222, sem IA/WhatsApp externos. O perfil de pareamento fica intacto.
- Um vermelho causal por correção; rodar o teste após restaurar cada sabotagem. Não aumentar timeout/teto de altura como substituto de causa.

## 1. Preservar o erro original

Arquivos: `tests/e2e/{gatilho-de-caso,gatilho-de-etapa,followup-builder}.spec.ts`.

- [x] Localizar os `finally` por estrutura, não pelo número de linha.
- [x] No caso Silêncio, temporariamente executar `await page.request.dispose(); expect("corpo", "LEVA_FINAL_ERRO_ORIGINAL_CONHECIDO").toBe("sabotado")` dentro do corpo: o relatório original acusa `apiRequestContext.post`, não a asserção.
- [x] Em cada disable/delete desprotegido do teardown, acrescentar `.catch(() => undefined)` e comentário explicando a substituição de exceção em `finally`.
- [x] Repetir a mesma sabotagem: relatório passa a mostrar `LEVA_FINAL_ERRO_ORIGINAL_CONHECIDO`. Remover a injeção temporária.
- [x] Executar os sete casos nomeados com a limpeza protegida; salvar log integral e anotar as fronteiras efetivamente alcançadas.
- [x] Commit nomeado de harness, separado dos consertos de produto. Sem fragmento: não muda comportamento da VPS.

## 2. Atribuir cada erro antes do produto

- [x] Caso/etapa/silêncio: medir `disabled`, retângulos, `scrollTop`, `clientHeight`, `scrollHeight` e hit-test de `trigger-config-save`; botão habilitado fora da viewport. PATCH aguarda o conserto de alcance. Não remover `!dirty` sem provar erro do draft.
- [x] Se o botão estiver recortado, separar corpo rolável e rodapé alcançável sem elevar `70dvh`; provar com clique/scroll reais e reload. Reverter só esse ajuste para obter o vermelho.
- [x] Caso/etapa: depois de salvar/publicar, provar enrollment pelo evento real do banco e dreno; no caso, também cancelamento. Motor passou nas duas sequências, sem alteração.
- [x] Wizard: primeiro erro era a espera da rota antiga; destino corrigido para `setup-ai` desta branch. Locator da identidade reaproveitado de `jornada-p0`. Caso isolado passou; nome congelado em produto fez o teste reprovar.
- [x] Espanhol: cinco falsos positivos eram a inicial decorativa da organização. Régua restrita ao cartão concreto; tradução real sabotada no produto reprovou as cinco rotas. Português retorna byte a byte na mesma tela.
- [x] Degradação: sem `test.fail`; controle positivo e supressão real de frames, assinatura, refetch, recuperação e aviso. Remover apenas o aviso reprovou após o detector recuperar o dado.
- [x] Agente novo: links junto dos campos, nos dois idiomas, sem oferecer destinos de edição ao modo somente leitura. Remoções independentes reprovaram os destinos respectivos; browser também reprovou sem os links.

Achado adicional dentro da prova de degradação: a verificação periódica não
aconteceu em 60s. Teste com hook/QueryClient reais reproduziu o reinício do timer
por `queryKey` nova a cada render. `useMemo([pipelineId])` corrige; sabotagem
devolveu o vermelho. O teto da spec acompanha dois ciclos reais de45s, não
acelera nem mascara a cadência. Aviso condicionado ao detector, com três units
(saudável/PT/ES); nenhuma alteração no hook genérico ou schema.

## 3. Verificar e salvar

- [x] Repetir o recorte completo restaurado, junto da geometria editor/Agenda para não perder a coexistência: 21 passed, zero skips, exit 0.
- [x] Rodar `corepack pnpm gov:verify`, `corepack pnpm test:db` e `corepack pnpm release:conferir`; todos exit 0. Unitários 7900; banco 1374 + 1 skip preexistente; 32 fragmentos válidos.
- [x] Fragmentos de produto (popover, detector/aviso, links como `capacidade_nova`), mapa de jornadas e Living System Checklist com artefatos concretos.
- [x] Revisão independente dos diffs e evidências; nenhuma objeção bloqueante. Wizard completo medido à parte: 3 passes, 1 falha posterior ao nome, 9 não executados por serial. Não importar P0 nem declarar a jornada completa verde.
- [x] Preparar commits nomeados e relatório com concluído/testado, pendente, bloqueado e não medido. Sem merge/deploy.

A confirmação do push e o SHA remoto pertencem ao relato final da execução,
depois de o GitHub aceitar a entrega; não são inferidos do commit local.
