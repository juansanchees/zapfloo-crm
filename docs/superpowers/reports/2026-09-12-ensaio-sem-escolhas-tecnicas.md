# Ensaio do onboarding sem escolhas técnicas — 12/set/2026

## Concluído e testado

| Mudança | Prova |
|---|---|
| Modelo e credencial saíram da tela; créditos de API não são mencionados | `onboarding-ensaio-ui.test.tsx` e `onboarding-setup-ai-aviso.test.tsx` |
| O padrão é `openai/gpt-5.6-luna`, centralizado fora do componente | `onboarding-modelo-do-ensaio.test.ts` e catálogo das migrations/baseline |
| Catálogo sem o padrão cai no primeiro modelo; catálogo vazio não lança | sabotagem em `sabotagem-sem-fallback.log` e jornada sintética no Playwright |
| Preparar → testar → revisar → continuar permanece funcional | Playwright: 8 casos verdes em banco local aplicado pelo `baseline.sql`, PT-BR e ES |
| Layout não transborda | medidas por `getBoundingClientRect` em 1280×720 e 390×720 |

Gates medidos em Node 22: `pnpm typecheck`, `pnpm lint`, `pnpm build`, gates de
canal/papel/release e `pnpm test:unit` (`754` arquivos, `7.875` casos). A prova
Playwright executou as duas specs tocadas e terminou com `8 passed`.

## Living System Checklist

- **Entrada:** catálogo ativo devolvido por `lerEnsaio` e rascunho preparado da organização.
- **Saída:** seleção automática alimenta `prepararEnsaio`; a execução continua registrando `llm_calls`.
- **Atividade/log:** não criou mutação nova; preserva os registros reais do ensaio já existentes.
- **Tela:** passo “Treine seu funcionário” em `/onboarding/setup-ai`.
- **Porta:** sequência canônica do onboarding; nenhuma tela ou rota nova foi criada.
- **Anti-morte:** catálogo vazio mantém “Explorar o CRM”; padrão ausente usa o primeiro disponível.
- **Configuração:** escolhas avançadas continuam em Agentes de IA › Avançado.
- **Continuidade IA↔humano:** a resposta continua exigindo revisão humana antes de avançar.
- **Laço de retorno:** resposta reprovada volta ao campo de mensagem para novo ensaio; só resposta revisada destrava a conexão.
- **Mapa vivo:** `docs/architecture/onboarding-ensaio.architecture.json` e o mapa de jornadas foram atualizados.

## Pendente

Nenhum item funcional desta leva.

## Bloqueado

Nenhum.

## O que não foi medido

Qualidade semântica de uma resposta de provedor externo, consumo/cobrança real de API,
latência na internet e execução em uma VPS remota. A chamada de modelo do E2E foi
interceptada por um receptor local determinístico; autenticação, banco, rotas,
persistência e navegador foram reais e locais.
