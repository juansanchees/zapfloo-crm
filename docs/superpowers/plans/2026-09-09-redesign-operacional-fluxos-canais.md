# Plano de implementação — acabamento operacional, fluxos e canais

## 1. Casca e identidade

- Escrever testes de navegação, empresa ativa, busca e sidebar fixa.
- Substituir o asset SVG estático revisado.
- Reorganizar a sidebar em trabalho diário e Crescimento usando rotas reais.
- Validar desktop, tablet, celular, menu recolhido e menu móvel.

## 2. Dashboard direto e responsivo

- Reproduzir o overflow atual com testes de componente e Playwright.
- Acrescentar reorder por ponteiro usando a dependência DnD já instalada.
- Acrescentar resize por ponteiro com snap nos tamanhos permitidos.
- Manter select e botões de mover como alternativa acessível.
- Validar persistência, cancelamento, reset e textos longos.

## 3. Follow-ups e criação com IA

- Inventariar nós, operadores e avaliação do worker.
- Expor chips somente para capacidades com execução comprovada.
- Criar rota autenticada para gerar `draft_graph` via `runModelCall`.
- Validar a saída com Zod e persistir somente rascunho.
- Integrar ao diálogo de novo fluxo, com revisão antes de publicar.

## 4. Canais e áudio

- Criar resumo unificado de conexões sem misturar os três modos de WhatsApp.
- Provar reprodução, transcrição, fallback e consumo de `derived_text`.
- Corrigir lacunas encontradas com testes antes da implementação.

## 5. Preparação da API Oficial da Meta

- Tornar explícito o fluxo BYO já compatível com self-host: empresa verificada,
  app próprio, WABA, número e token permanente.
- Validar as credenciais com a Meta antes de persistir e guardar o token cifrado
  por sessão e organização.
- Exibir callback, verify token, campos de webhook e checklist externo da Meta.
- Não simular Embedded Signup nem prometer prazo de aprovação da Meta.

## 6. Verificação e entrega

- Rodar os unitários direcionados após cada fase.
- Rodar `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` e `pnpm build`.
- Rodar `pnpm test:db` se a implementação tocar schema/RLS.
- Rodar Playwright das jornadas alteradas com evidência visual.
- Solicitar revisão de código antes de declarar conclusão.
