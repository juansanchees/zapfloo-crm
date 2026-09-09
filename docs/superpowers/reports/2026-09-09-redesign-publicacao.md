# Integração visual Zapfloo — 2026-09-09

## Escopo

Integração da identidade aprovada no produto existente: superfícies grafite/lavanda, navegação selecionada, compositor, lista de conversas, cartão de acesso e logo SVG fornecida pelo proprietário. Não é reprodução integral do mockup Behance nem mudança de regras de negócio. Fonte dos tokens de produção: `app/globals.css`; o showcase histórico do design system conserva referências anteriores.

A cor segue o resolvedor canônico de marca. A configuração operacional da instalação será roxo `#8250f2` e `/brand/zapfloo-logo.svg`; os tons efetivamente pintados são normalizados por contraste. Não há alteração de schema, chaves, organização, permissões ou política do WhatsApp.

## Evidência local

- Build de produção local: exit 0. Primeira tentativa encontrou cache `.next` inconsistente; cache movido para diretório temporário recuperável e build limpo aprovado.
- Typecheck: exit 0. Lint dos arquivos afetados: zero erros; aviso preexistente no Sidebar permanece.
- 103 testes focados em sete arquivos: aprovados. Incluem contraste, régua gerada, marca dinâmica e tema claro escopável. Novo teste de textos secundários falhava na paleta anterior e passa na atual, com piso 4,5:1.
- Jornada local PT/ES: aprovada, sem chamadas reais de IA nem envio WhatsApp. Evidência visual em `evidence/onboarding-jornada/`; testes de largura verificam ausência de rolagem horizontal no fluxo mobile.
- Suítes globais não repetidas, conforme escopo essencial autorizado. Não se afirma ausência de todos os bugs.

## Publicação e recuperação

Pendente de execução neste registro inicial. Será atualizada apenas a imagem do app; worker/agendador permanecem em `90456dec`. Preservar override dessa release ao adicionar o override visual. Sem GitHub/Actions, build nativo amd64 na própria VPS pela exceção já autorizada.

Antes da configuração visual, guardar a linha `platform_branding` em arquivo restrito. Rollback: imagem `zapfloo-app:90456dec` e valores anteriores da marca; não restaurar o banco inteiro nem remover volumes. A inspeção prévia confirmou duas organizações sem overrides de cor/logo, nome da plataforma Zapfloo e cor/logo ausentes.
