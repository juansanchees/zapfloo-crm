# Cobrança Monetizze — especificação aprovada

## Objetivo

Fazer o Zapfloo cobrar assinaturas mensais pela Monetizze, ativar e atualizar o
plano automaticamente por postback e, somente quando o interruptor global for
ligado pelo administrador da plataforma, bloquear organizações sem acesso
comercial válido sem perder mensagens recebidas.

## Contratos imutáveis deste lote

- Os preços, limites e recursos continuam vindo de `lib/billing/planos.ts` e
  não mudam neste trabalho.
- A organização nasce em teste por sete dias.
- Uma assinatura ativa vale até um mês-calendário depois do último pagamento
  confirmado, mais três dias de tolerância.
- Recusa ou cancelamento não apagam o período já pago; o acesso termina no fim
  desse período mais três dias.
- `pausado` é um bloqueio manual e não concede acesso.
- A decisão comercial é única e compartilhada por UI, APIs e workers.
- O bloqueio nasce desligado no banco e nunca é ligado por migration.
- Administradores da plataforma nunca são bloqueados.
- Com o bloqueio desligado, organização comercialmente vencida continua usando
  o produto; com ele ligado, `/app` redireciona para Plano e pagamentos.
- Login, logout, Plano e pagamentos e o postback permanecem acessíveis.
- Mensagens recebidas continuam arquivadas e persistidas. Apenas respostas e
  demais saídas são interrompidas enquanto a organização estiver bloqueada.
- Nenhuma assinatura existente é alterada ou apagada pela migration.

## Contrato oficial observado da Monetizze

Fonte primária: <https://apidoc.monetizze.com.br/postback/index.html>.

- A Monetizze envia JSON ou `application/x-www-form-urlencoded`.
- `chave_unica` identifica a conta/integração e é igual em todos os avisos; não
  é chave de idempotência.
- `id` identifica o disparo do webhook.
- `codigo_venda` / `venda.codigo` identifica a venda.
- `codigo_status` e `postback_evento` identificam estado/evento.
- `produto.codigo` identifica o produto, mas não distingue planos do mesmo produto.
- `plano.referencia` identifica o plano contratado e governa o `plan_id` no Zapfloo.
- `assinatura.codigo`, `assinatura.status`, `assinatura.data_assinatura` e
  `assinatura.parcela` descrevem a assinatura recorrente.
- `comprador.email` existe, mas é apenas fallback de conciliação.
- `venda.src` devolve o valor enviado no parâmetro `src` do link de divulgação.
- Eventos relevantes: 2 (pagamento aprovado), 3 (cancelada), 4 (devolvida),
  5 (bloqueada), 9 (reembolso solicitado), 101 (assinatura ativa), 102
  (inadimplente), 103 (assinatura cancelada) e 104 (aguardando pagamento).

A documentação do checkout em `app.monetizze.com.br` declara preenchimento de
e-mail pelo parâmetro `email`, conforme
<https://help.monetizze.com.br/books/funil-de-conversao/page/parametros-de-url-no-checkout>.

Medição em 2026-09-24 no checkout real
`https://pay.monetizze.com.br/DCY386459`: a página preservou `email` e `src` na
URL, mas o campo de e-mail permaneceu vazio mesmo com `?email=teste@example.com`.
Como o teste autorizado foi somente abrir a página, a propagação de `src` até o
postback ainda não foi medida por uma compra. O código continua enviando ambos,
mas nenhuma entrega pode afirmar preenchimento no domínio `pay` sem nova prova.

## Regra de correlação

1. O Zapfloo inclui em `src` uma referência opaca, assinada e expirada da
   organização. Não expõe nem confia em UUID cru recebido do navegador.
2. O postback valida a referência e vincula a compra à organização.
3. Sem referência válida, tenta casar `comprador.email` com exatamente um admin
   de exatamente uma organização.
4. Zero ou múltiplas correspondências geram item pendente na fila da plataforma;
   pagamento nunca é descartado ou atribuído por palpite.

A referência é assinada por HMAC com subchave derivada de
`MONETIZZE_CHAVE_UNICA` e contexto próprio. Assim não nasce outro segredo e a
chave de conta nunca é exposta no link.

## Idempotência e ordem

- A trava de negócio exigida é `(codigo_venda, codigo_status)`.
- O `id` do webhook também é único e fica guardado para reconhecer retries.
- Avisos duplicados retornam sucesso sem repetir transição ou auditoria.
- O timestamp `data` e a parcela da assinatura impedem regressão por evento
  antigo. Evento fora de ordem é registrado como ignorado.
- Referência de plano desconhecida é registrada como ignorada e nunca muda assinatura.

## Persistência mínima

Migration seguinte à `0238`, reconfirmada imediatamente antes de criar:

- ampliar o CHECK de `organization_subscriptions.status` para
  `teste | ativo | recusado | cancelado | pausado`;
- adicionar datas e vínculo externo nullable à assinatura, sem backfill e sem
  alterar as linhas existentes;
- singleton de configuração comercial com `enforcement_enabled = false`;
- ledger server-only de eventos Monetizze, contendo somente campos normalizados,
  hash do e-mail e, para operação humana, e-mail mascarado;
- função transacional server-only para reivindicar o evento, resolver vínculo,
  atualizar a projeção da assinatura e marcar o resultado;
- função nova em `public` revoga EXECUTE de `public`, `anon` e `authenticated`,
  concedendo apenas a `service_role`.

A entrega de schema sempre inclui migration, apêndice idempotente no baseline,
linha no MANIFEST e atualização de `lib/database.types.ts`.

## Variáveis de ambiente

- `MONETIZZE_CHAVE_UNICA`
- `MONETIZZE_PLANO_REFERENCIA_BASICO`
- `MONETIZZE_PLANO_REFERENCIA_ESSENCIAL`
- `MONETIZZE_PLANO_REFERENCIA_COMPLETO`
- `MONETIZZE_CHECKOUT_BASICO`
- `MONETIZZE_CHECKOUT_ESSENCIAL`
- `MONETIZZE_CHECKOUT_COMPLETO`

Todas são server-only e opcionais no boot. Ausência mantém a tela informativa e
o postback fechado; nunca torna o produto inseguro nem derruba instalações atuais.

## Portão antes do parser

O parser não será escrito até existir um postback de teste enviado pelo painel
real da Monetizze. O payload será anonimizado sem mudar nomes, tipos ou estrutura
e salvo como fixture. A captura requer a tela antiga da Monetizze autenticada e
confirmação do dono imediatamente antes do clique que dispara o teste.

## Fora do escopo

- Mudar preço ou limite.
- Migrar ou reclassificar organizações existentes.
- Ligar o bloqueio no deploy.
- Apagar inbound, canal, conversa ou mídia por inadimplência.
- Gerar versão, mesclar ou publicar.
