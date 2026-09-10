# Onda única de correções da revisão integrada

Base revisada: `d8a657030193c49f84ff5dbc17e36f2a623d5e91`. Revisão p0_review_integrada
encontrou três Important e um Minor, reproduzidos sem banco. GovR5 desta base
terminou exit0:755 arquivos/7914 testes,408.91s. Verde não cobre estes defeitos.

## Findings obrigatórios

1. `setup-ai/page.tsx:67` chama `skipAi` sem contexto; `createDefaultAgent.ts:509–516`
   resolve cookie atual. Formulário A + cookie trocado para B altera B. Reusar
   `contextoDoRascunho(userId,orgId)`, capturar contexto da página, validar antes
   de ler/gravar. Conflito precisa ser visível e acionável, com zero patch/audit/
   redirect. Não confiar em org enviada como autorização, não mudar requireCtx.
2. `connect-whatsapp/_client.tsx:325–344`: erro HTTP503/rejeição do polling apaga
   channel_session_id. POST STARTING+UUID → erro → GET WORKING semUUID deixa
   autoavanço parado. Preservar id nos erros, mantendo falha visível; testar os
   dois erros e exatamente uma confirmação após recuperação.
3. `vps-fresh-onboarding.spec.ts:146` passa array de usuários para toHaveLength;
   falha imprime dados pessoais. Revisar todos os asserts do preflight que
   recebem usuários, organizações/estado, vínculos e fatores: usar contagem/
   booleano/valor neutro, nunca registro integral. Provar com marcador runtime
   que o erro da versão instalada não o contém, e sabotagem que volta a vazar.
4. `_client.tsx:403`: erro comum some em WORKING, mas alternativo só está no QR
   (:556). Ao sair do QR e falhar Conferir canais, erro fica invisível. Esconder
   o comum somente quando QR renderiza o próprio; testar escolha/oficial/parceiro.

## Ownership, limites e prova

Executor único: p0_interface_conexao, reaproveitando seu contexto da Task2.
Ownership: os três arquivos de produto citados; componente client focado para
adiamento se necessário; i18n para texto novo; testes correspondentes unitários
e E2E (ampliar `troca-de-organizacao-tem-volta.spec.ts` ou `onboarding-sem-ia.spec.ts`
existentes, sem novo job/config/skip); preflight e regressão de segurança da fresh;
relatório `final-fix-report.md`. Root cuida ledger/docs/fragmento/infra/revisão.
Você não está sozinho: não reverta nem inclua arquivos do root; nenhum subagente,
push/PR, main, schema, `.env*`, runtime.json, produção, novo pareamento ou mensagem.

- Antes de implementar, ler guias instalados Next forms/use-server. Preservar
  revalidação getUser/RBAC/MFA; contexto esperado é detector de formulário antigo,
  não credencial. Changelog/doc SSR Supabase conferidos pelo root; não há mudança
  de API/cliente/schema proposta, só uso de proteção existente do produto.
- RED→GREEN e sabotagem restaurada para cada finding. Testes não podem aceitar
  falta de patch/erro silencioso ou imprimir marcador sensível. Sem timers frágeis
  quando fake timers/polling controlado existentes bastarem.
- Para UI, escrever regressão E2E versão normal com conta fictícia, sem WhatsApp
  real. Root prepara build/perfilB e executa depois do freeze. Você não altera
  infra/banco diretamente; testar unitários locais e informar specs/grep exatos.
- Não rodar gov completo nem test:db por conta própria: root consolida após o
  freeze. Execute dirigidos/lint; informe FREEZE logo após restaurar sabotagens.
- Commit pequeno nomeado de arquivos próprios; relatório com comandos/output,
  SHA, sabotagens e limites. Revisão posterior é só findings+fixdiff, não nova
  revisão aberta. Se precisar de schema/mecanismo novo, pare e escale.
