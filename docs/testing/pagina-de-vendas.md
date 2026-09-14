# Página pública de vendas — contrato e prova

O Caddy reescreve apenas `/` do domínio comercial para `/vendas`. Sem os
domínios configurados, os blocos usam hosts HTTP locais e não solicitam
certificado da Zapfloo em instalações de terceiros. APIs e telas autenticadas
não são publicadas pelo domínio comercial.

## Living System Checklist — página de vendas

- Quem alimenta: catálogo central `lib/billing/planos.ts` e as configurações opcionais `SALES_*`.
- Quem a peça alimenta: CTA explícito leva ao cadastro já existente em `crm.zapfloo.tech/signup`.
- Log emitido: N/A; a página é somente leitura e não cria evento nem dado.
- Onde aparece: raiz do `SALES_DOMAIN`, reescrita pelo Caddy para a rota pública `/vendas`.
- Anti-morte: CTA permanece visível em hero, planos e fechamento; WhatsApp ausente não deixa espaço ou link quebrado.
- Configuração: `.env.example` documenta domínio, www e número; vazio desliga o domínio comercial e esconde o contato.
- Continuidade IA-humano: N/A; não há atendimento nem automação nessa superfície.
- Laço de retorno: N/A nesta entrega; não foi adicionado rastreamento ou coleta de marketing.
- Mapa vivo: entrada HTTP no Caddy e saída para `/signup`; não altera o mapa operacional autenticado.

## Provas

- `components/marketing/SalesPage.test.tsx`: preço e limites vêm do catálogo; número vazio esconde WhatsApp.
- `tests/unit/pagina-de-vendas-caddy.test.ts`: fallback sem certificado e superfície HTTP restrita.
- `tests/e2e/pagina-de-vendas.spec.ts`: render real em 390 e 1280 px, com medida de transbordo.
