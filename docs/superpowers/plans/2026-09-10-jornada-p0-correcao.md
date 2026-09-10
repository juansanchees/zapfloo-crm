# Correção integral da jornada P0

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Executar por tarefas com testes adversariais e revisão.

**Goal:** concluir o onboarding sem IA após conexão comprovada, sem confundir exploração temporária com conclusão persistida.

**Architecture:** reaproveitar estado e Server Actions do onboarding. Conexão é independente de ativação restrita; escrita só após confirmação confiável no servidor, com tenant/RBAC. A prova positiva usa baseline fresco, bootstrap-owner, WAHA e Redis reais; o pareamento exige um aparelho autorizado do dono.

**Tech Stack:** Next.js 16, React 19, Node 22, corepack pnpm, Supabase local pg15, Docker, Vitest e Playwright.

**Spec:** anexo do usuário `/Users/juansanches/.codex/attachments/8d68e1e4-8485-4b04-bf52-3228baeda7e7/pasted-text.txt`, dez itens e aceite; disponível aos executores.

## Global Constraints

- Trabalhar apenas em `codex/jornada-p0`; rebase sobre `codex/altura-shell`, sem main/merge/deploy/VPS.
- Não abrir `.env*`, não tocar `.codex/config.toml`, preservar worktrees e contêineres de outras sessões.
- Não falsificar WORKING, QR, onboarded_at ou aprovação do onboarding na prova positiva. DB nessa prova apenas bootstrap e leitura de evidência.
- IA continua opcional e não é ativada por conectar/adicionar preferência; preservar agentes e políticas de canais existentes, inclusive modo de teste já entregue.
- Textos novos entram em i18n; providers na interface usam lib/channels; sem ampliação de allowlists.
- Sem schema planejado. Se indispensável, parar para conferir numeração e tripla migration + baseline idempotente + MANIFEST.
- Rodar gov:verify, test:db, E2E afetados; os cinco checks exigidos precisam de execução real no CI. Não abrir PR sem avisar.
- Fragmento de produto e mapa de jornadas precisam separar concluído/testado, pendente, bloqueado e não medido.

## Task 1: Conexão cumprível e progresso independente da IA

**Files:** `app/actions/onboarding/skipWhatsapp.ts`, `lib/onboarding/passos.ts`, testes correspondentes em `tests/unit/` e `lib/onboarding/passos.test.ts`; helper em `lib/onboarding/` somente se necessário para separar validação real do estado.

**Interfaces:** manter `markWhatsappConfigured` como escritor de produto, sem confiar em status/tenant recebidos do navegador. Resultado bem-sucedido persiste `whatsapp` e conduz ao roteador. O passo `connect-whatsapp` deixa de depender de `ai.restricted_activation`. A UI da Task 2 consumirá a ação e tratará falhas explicitamente.

- [ ] Testar ação com sessão realmente confirmada pela fronteira de transporte, admin/tenant válido, estado preservado; casos negativos status falso/STARTING, sessão alheia, canal arquivado e erro de consulta não podem gravar nem avançar.
- [ ] Testar `proximoPasso` com `whatsapp` conectado sem IA, IA adiada e IA revisada sem ativação: respectivamente setup-ai ou próximo passo restante, nunca retorno à conexão por falta de ativação.
- [ ] Implementar validação no servidor usando cliente/adaptador existente e escrita restrita ao tenant. Não reutilizar a versão antiga que aceitava status arbitrário como prova.
- [ ] Provar vermelho inicial; após verde remover a escrita de whatsapp e comprovar que o teste de conclusão/releitura reprova. Restaurar e registrar comandos/logs.
- [ ] Commit próprio e revisão do contrato de segurança/estado.

## Task 2: Avanço visível, IA adiável e saída única persistente

**Files:** `app/onboarding/connect-whatsapp/_client.tsx`, `page.tsx`, `app/onboarding/setup-ai/{page,_form,_ensaio}.tsx`, `app/onboarding/welcome/page.tsx` (cópia da mesma saída), `app/actions/onboarding/{explorar,createDefaultAgent}.ts`, `lib/onboarding/jornada.ts` se necessário para preservar adiamento, `lib/i18n/dicionario.ts`, testes unitários de conexão/saídas/exploração/ensaio. Componente auxiliar focado na confirmação permitido dentro de `connect-whatsapp/` se reduzir a duplicação entre as três formas de conectar.

**Interfaces:** consumir escritor da Task 1 ao observar conexão; redirecionar pelo roteador após confirmação. Reaproveitar `skipAi` por escolha explícita e preservar configuração ativa/revisada ao adiar, sem apagar rascunhos. Um único `ExplorarCrm` permanece no layout comum; sem `.last()` para contornar duplicação.

- [ ] Teste UI de WORKING chama confirmação e avança; erro de confirmação mostra falha acionável e não promete avanço infinito. Sabotar removendo o efeito e confirmar vermelho.
- [ ] Atualizar docstring para descrever o estado real; botão Conferir deve confirmar canal existente, não só recarregar sem efeito. Mesma semântica com IA e sem IA.
- [ ] Preservar `channel_session_id` quando o POST traz o id e o polling GET só traz status; testar essa sequência completa. Para conexões existentes, escolher id da lista autenticada e confirmar pelo mesmo escritor, sem confiar no status do navegador.
- [ ] Expor adiamento explícito da IA para alcançar funil e convite sem credencial; ao confirmar revisão navegar pelo roteador, sem voltar compulsoriamente à conexão já cumprida.
- [ ] Remover as duas cópias de Explorar da tela de conexão e testar composição com layout: exatamente um botão.
- [ ] Cookie de exploração dura 30 dias (`60 * 60 * 24 * 30`), alinhado à preferência existente de organização ativa; mantém httpOnly, sameSite, secure, path e vínculo usuário/tenant. Testar expiração positiva e sabotar sua remoção.
- [ ] Testar negativo: adiar não publica/ativa/desativa agente, não muda `em_teste` ou listas de confiança; erro não marca etapa.
- [ ] i18n, testes dirigidos, sabotagens restauradas, commit próprio e revisão.

## Task 3: E2E versionado e jornada fresca executável

**Files:** `tests/e2e/vps-fresh-onboarding.spec.ts`, nova `tests/e2e/onboarding-sem-ia.spec.ts`, specs afetadas pela ordem, `.github/workflows/e2e.yml`; `vitest.config.ts` e `tests/unit/escopo-dos-gates.test.ts` somente se necessário para estreitar o escopo.

**Interfaces:** telas finais das Tasks 1–2. Spec sem IA verifica variáveis opcionais ausentes, zero credenciais/ativação no banco, QR carregado, progresso real, funil, equipe, onboarded_at e novo contexto sem cookie de exploração.

- [ ] Migrar/adaptar a prova local para `tests/e2e/`, sem caminhos fixos de máquina nem portas mortas. Declarar execução ou exclusão com motivo exato no workflow.
- [ ] Atualizar vps-fresh para ordem real e retirada de ações inexistentes. Não apagar sessões `org_*` indiscriminadamente; atuar só no recurso do dono fictício em ambiente isolado validado.
- [ ] Manter ausência de RESEND e chaves IA como asserção, inclusive no ambiente do app, não só no runner de teste.
- [ ] Rodar specs afetadas; alterar expectativa de ordem apenas quando ela mede a decisão aprovada, não mascarar bugs do produto.
- [ ] Reavaliar `**/tests/e2e/**`: se não houver justificativa de domínio, voltar à âncora da raiz mantendo exclusões explícitas de worktrees/evidências. Testar que arquivo próprio aninhado volta à coleta e terceiros ficam fora; sabotar.
- [ ] Se a prova exige scan manual/licença/canal externo que o CI não possui, não inventar automação: registrar impedimento exato e separar teste determinístico com fronteira controlada da prova real executada localmente.
- [ ] Commit próprio, revisão e teste de completude das specs.

## Task 4: Prova real, docs e fechamento

**Files:** `.superpowers/evidence/jornada-p0-correcao-2026-09-10/`, `.changes/2026-09-10-conexao-sem-ia.md`, `docs/testing/{jornada-p0-sem-ia,user-journey-map}.md`; runner local da prova em pasta ignorada, spec sempre versionada.

- [ ] Preparar stack isolada com portas livres, baseline pg15 + extensões do instalador + bootstrap-owner. WAHA e Redis ativos de verdade; segredos efêmeros fora do git/logs.
- [ ] Mostrar QR real sem chave IA em 1440/768/390; medir getBoundingClientRect/getComputedStyle e overflow. Solicitar aparelho de teste ao dono para pareamento real, sem enviar mensagens a terceiros.
- [ ] Após pareamento, registrar progresso automático, funil e convite acessíveis, fim persistido e reentrada em contexto novo. QR deve ser invalidado/seguro antes de versionar evidência; não versionar sessão/token/telefone.
- [ ] Rodar gov:verify e test:db completos, E2E e cinco checks de CI. Separar bloqueio de infraestrutura/acesso de falha de produto.
- [ ] Atualizar fragmento e mapa com resultados concretos e limites, corrigindo afirmações antigas do pacote sem reescrever seus logs históricos.
- [ ] Revisão final, commits/push seguros (lease explícito para rebase remoto), nenhum merge/deploy. Relatório em três colunas e campo O QUE NÃO FOI MEDIDO.
