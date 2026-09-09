# Integração visual Zapfloo — 2026-09-09

## Escopo

Integração da identidade aprovada no produto existente: superfícies grafite/lavanda, navegação selecionada, compositor, lista de conversas, cartão de acesso e logo SVG fornecida pelo proprietário. Não é reprodução integral do mockup Behance nem mudança de regras de negócio. Fonte dos tokens de produção: `app/globals.css`; o showcase histórico do design system conserva referências anteriores.

A cor segue o resolvedor canônico de marca. A configuração operacional da instalação será roxo `#8250f2` e `/brand/zapfloo-logo.svg`; os tons efetivamente pintados são normalizados por contraste. Não há alteração de schema, chaves, organização, permissões ou política do WhatsApp.

## Evidência local

- Build de produção local: exit 0. Primeira tentativa encontrou cache `.next` inconsistente; cache movido para diretório temporário recuperável e build limpo aprovado.
- Typecheck: exit 0. Lint dos arquivos afetados: zero erros; aviso preexistente no Sidebar permanece.
- 103 testes focados em sete arquivos: aprovados. Incluem contraste, régua gerada, marca dinâmica e tema claro escopável. Novo teste de textos secundários falhava na paleta anterior e passa na atual, com piso 4,5:1.
- Jornada local PT/ES: aprovada, sem chamadas reais de IA nem envio WhatsApp. Evidência visual em `evidence/onboarding-jornada/`; testes de largura verificam ausência de rolagem horizontal no fluxo mobile.
- Tema claro/escuro e idioma foram conferidos nas capturas
  `evidence/onboarding-jornada/login-pt-BR-light.png`,
  `evidence/onboarding-jornada/login-pt-BR-dark.png`,
  `evidence/onboarding-jornada/login-es-light.png`,
  `evidence/onboarding-jornada/login-es-dark.png`,
  `evidence/onboarding-jornada/inbox-pt-BR-light.png`,
  `evidence/onboarding-jornada/inbox-pt-BR-dark.png`,
  `evidence/onboarding-jornada/inbox-es-light.png`,
  `evidence/onboarding-jornada/inbox-es-dark.png`,
  `evidence/onboarding-jornada/agente-pt-BR-celular-dark.png` e
  `evidence/onboarding-jornada/agente-es-celular-dark.png`.
- Suítes globais não repetidas, conforme escopo essencial autorizado. Não se afirma ausência de todos os bugs.

## Publicação e recuperação

Executada às 03:32 UTC de 2026-09-09: app `582ea60f31c32b141b3e9bc76d56facba59bf9da`, imagem amd64 `sha256:bc63c204c8d3f59fd5886040af279b0d7f4c07c07cafb22363c49397e045cd90`. Build remoto exit 0; endpoint HTTPS de saúde confirmou versão `582ea60f`, Supabase/Redis/WAHA ok. Isso prova conectividade do serviço WAHA, não pareamento do número.

Worker/agendador permanecem em `90456dec`. Comparação dos IDs antes/depois confirmou mudança somente do app. Sem GitHub/Actions, build nativo na própria VPS pela exceção autorizada. Transporte SHA256 `96ff95c0f72eb12d4efd775782a71dca6299bba999376dafffc83b56ca28cbd1` conferido nas duas pontas.

Linha anterior guardada com permissão 600 em `/opt/zapfloo/releases/582ea60f/brand-before.json`. Aplicados somente cor, URL de logo e indicador de configuração explícita, com comparação dos valores anteriores para impedir sobrescrita concorrente. Nome Zapfloo preservado. A inspeção prévia confirmou duas organizações sem overrides de cor/logo.

Conferência final no Chrome autenticado em `/app/inbox`: logo visível, superfícies grafite, seleção roxa e navegação existente preservada. Página pública de login entrega a nova logo. O aviso preexistente de WhatsApp desconectado continua visível; não houve reconexão, envio ou liberação de atendimento. Captura de produção não foi adicionada ao repositório por conter dados reais.

Comando operacional desta instalação (Caddy):

```sh
cd /opt/zapfloo
docker compose -p zapfloo --env-file .env -f docker-compose.prod.yml -f releases/90456dec/docker-compose.release.yml -f releases/582ea60f/docker-compose.redesign.yml up -d --no-deps app
```

Rollback visual: executar o mesmo comando sem o último override e restaurar os campos de marca pelo script `configure-brand.cjs rollback` (cópia operacional no worker, exige o backup JSON). O script recusa sobrescrever uma marca alterada posteriormente. Não restaurar o banco inteiro nem remover volumes. Manter os artefatos em `/opt/zapfloo/releases/582ea60f/`; nenhum segredo está neste relatório.
