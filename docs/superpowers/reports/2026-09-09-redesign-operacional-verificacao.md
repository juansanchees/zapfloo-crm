# Verificação local do redesign operacional — 2026-09-09

## Escopo entregue

- shell operacional com navegação compacta, área de trabalho clara e identidade white-label;
- dashboard personalizável por usuário, persistido no banco e protegido por RLS;
- nova área **Pergunte à IA**, somente leitura, com ferramentas explicitamente permitidas, fontes e limites de uso;
- hierarquia visual compartilhada em dashboard, contatos, funis e agentes de IA;
- tradução PT-BR/ES e adaptação para desktop, tablet e celular;
- documentação do design system, mapas de arquitetura, jornada e fragmentos de release.

Esta entrega permanece local na branch `codex/onboarding-roxo`. Nenhuma VPS, imagem publicada, organização real, chave de IA ou sessão de WhatsApp foi alterada nesta etapa.

## Evidência executada

- `corepack pnpm typecheck`: exit 0.
- `corepack pnpm lint`: exit 0, sem erros; 312 avisos já existentes.
- `corepack pnpm build`: exit 0.
- `corepack pnpm test:unit`: 733 arquivos e 7.764 testes aprovados.
- `corepack pnpm test:db`: 163 arquivos, 1.344 aprovados e 1 ignorado; instalação e atualização do `baseline.sql` aprovadas.
- `corepack pnpm test:shell`: exit 0; todos os validadores aprovados. A prova do consumidor `docker compose env_file` foi ignorada porque o Docker Compose não está disponível nesta máquina, como a própria suíte registra.
- `corepack pnpm exec playwright test tests/e2e/redesign-operacional.spec.ts`: 3/3 aprovados.
- `git diff --check`: exit 0.

As capturas geradas localmente ficam em `.superpowers/evidence/redesign-operacional/` e não são versionadas. A matriz visual cobre desktop/tablet/mobile, temas claro/escuro e idiomas PT-BR/ES. O E2E também prova persistência e restauração do dashboard e resposta do copiloto com fontes, sem mutações.

## Limites e publicação

O teste de **Pergunte à IA** intercepta a resposta do provedor para ser determinístico; as regras, o contrato HTTP, os limites e a apresentação foram exercitados, mas nenhuma cobrança real de modelo foi gerada. O servidor E2E registrou avisos de configuração local ausente e avisos já existentes sobre uso de sessão; eles não causaram falha na suíte e não são declarados resolvidos por este redesign.

Publicar exige uma etapa separada: revisar o commit local, aplicar a migration com o caminho de atualização suportado, produzir a imagem na arquitetura correta, atualizar os serviços sem remover as labels do proxy e executar smoke test autenticado. Não publicar somente o app sem a migration, pois a personalização do dashboard depende da nova tabela.
