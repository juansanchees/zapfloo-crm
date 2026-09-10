# Período de testes — validação local

## Entrega

- Aviso no CRM, onboarding e detalhe administrativo da empresa.
- Vencimento em sete dias corridos desde `organizations.created_at`, com horário
  de Brasília e contador atualizado no navegador, sem renovar ao recarregar.
- Estado vencido e estado de data indisponível explícitos.
- Inbox usa a altura restante do shell, incluindo avisos e abas, sem cortar o composer.
- Sem cobrança, suspensão automática, mudança de schema ou de permissões.

## Evidência de 09/09/2026 (Brasília)

- `corepack pnpm typecheck`: exit 0.
- `corepack pnpm lint`: exit 0; 312 warnings preexistentes, zero errors.
- `corepack pnpm e2e:build`: exit 0; build com Supabase local.
- `corepack pnpm test:unit --maxWorkers=4 --reporter=dot`: exit 0;
  740 arquivos, 7.793 testes aprovados.
- Testes focados de prazo, componente e cobertura E2E: 12 aprovados, exit 0.
- `E2E_PORT=3017 corepack pnpm exec playwright test tests/e2e/periodo-de-testes.spec.ts --reporter=list`:
  exit 0; jornada aprovada em 1440×900, 768×1024 e 390×844, sem pageerror.
  Reexecutada após aguardar o estado carregado da conversa para as screenshots.
- Capturas de fixture sem dados de clientes em `.superpowers/evidence/periodo-de-testes/`.

## Publicação pendente

Não houve alteração da VPS. As tentativas com chaves locais existentes foram
negadas ou expiraram; nenhuma credencial foi lida ou exposta. É necessário
restabelecer acesso autorizado ao servidor/console Hostinger antes de publicar e
validar o aviso em produção. Não houve push ou execução de workflow pago.
