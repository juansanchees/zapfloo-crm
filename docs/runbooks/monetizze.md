# Cobrança Monetizze

## Antes de ligar

Configure no `.env` da instalação, sem publicar os valores:

- `MONETIZZE_CHAVE_UNICA`
- `MONETIZZE_PLANO_REFERENCIA_BASICO`
- `MONETIZZE_PLANO_REFERENCIA_ESSENCIAL`
- `MONETIZZE_PLANO_REFERENCIA_COMPLETO`
- `MONETIZZE_CHECKOUT_BASICO`
- `MONETIZZE_CHECKOUT_ESSENCIAL`
- `MONETIZZE_CHECKOUT_COMPLETO`

Os checkouts aceitos são os endereços oficiais `pay.monetizze.com.br` e
`app.monetizze.com.br`. O encurtador `mon.net.br` não é aceito porque não há
garantia de que a referência assinada da organização sobreviva ao redirecionamento.

## Cadastrar o postback permanente

1. No painel da Monetizze, abra **Ferramentas → Postback / Webhook**.
2. Adicione um postback do tipo **Postback (server to server)**, em formato JSON.
3. Cole esta URL:

   `https://crm.zapfloo.tech/api/v1/webhooks/monetizze`

4. Selecione os eventos 2, 3, 4, 5, 9, 101, 102, 103 e 104.
5. Salve e confira no painel `/admin` se o evento entrou aplicado ou pendente de conciliação.

## Ordem segura de ativação

1. Publique a versão.
2. Configure as sete variáveis.
3. Configure o postback permanente.
4. O dono assina o Básico pela própria tela como teste real.
5. Revise a lista de empresas em `/admin` e concilie qualquer compra pendente.
6. Só então ligue o bloqueio comercial.

O parâmetro `email` não preencheu o checkout real em `pay.monetizze.com.br` na
medição autorizada. A propagação do `src` até o postback também ainda não foi
provada por uma compra; por isso o fallback por e-mail e a fila de conciliação
continuam sendo redes de segurança, não provas de correlação.
