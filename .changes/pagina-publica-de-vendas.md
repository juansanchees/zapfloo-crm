---
impacto: exige_acao
secao: adicionado
titulo: Página pública apresenta o produto e os três planos
---

A instalação pode servir uma página pública, clara e adaptada ao celular, com
os recursos e preços lidos da mesma configuração que aplica os limites. O botão
principal leva ao cadastro de sete dias; o contato por WhatsApp só aparece
quando existe um número configurado.

## Requer atenção

Para ativar a página na VPS da Zapfloo, acrescente exatamente estas linhas ao `.env`:

```dotenv
SALES_DOMAIN=https://zapfloo.tech
SALES_WWW_DOMAIN=https://www.zapfloo.tech
SALES_WHATSAPP_NUMBER=
```

Preencha `SALES_WHATSAPP_NUMBER` apenas quando houver um número comercial
aprovado, usando DDI + DDD + número. Vazio mantém o botão escondido.
