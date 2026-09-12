# Superfícies por papel — 12/09/2026

## Escopo

Branch `codex/superficies-por-papel`, derivada de `origin/main` em
`5cd59cb14`. Esta entrega atualiza a decisão comercial e registra a matriz de
papéis. A restrição de acesso não foi alterada porque o aceite exige, ao mesmo
tempo, acesso exclusivo da plataforma e nenhuma perda de acesso legítimo — e o
código atual concede essas superfícies a administradores do tenant.

| CONCLUÍDO E TESTADO | PENDENTE | BLOQUEADO |
|---|---|---|
| `CLAUDE.md`, `AGENTS.md` e `VISION.md` agora descrevem assinatura multi-tenant como modelo principal e preservam self-host como opção real. Prova: 10 testes verdes em `agents-md-versoes` + `modelo-comercial-e-papeis` e `git diff --check`. Sabotagem: retirar “assinatura” de `AGENTS.md` reprova o gate; restaurar devolve o verde. | Traduzir a matriz pretendida em guards de navegação, páginas, APIs, caminhos alternativos e políticas RLS. | “Admin da organização” e “admin de plataforma” são autoridades diferentes. `lib/navigation/registry.ts` só expressa papéis do tenant; aumentar `minRole` para `admin` não cria isolamento de plataforma. |
| `docs/business-rules/papeis-e-telas.md` documenta recepcionista, gerente, administrador tenant de compatibilidade e administrador de plataforma, separando visibilidade, URL, API e banco. | Definir a migração dos administradores tenant existentes: manter acesso no self-host, retirar no serviço gerenciado ou criar uma capacidade explícita por instalação. | Tokens de API são legitimamente usados pelo administrador tenant e têm teste positivo. Retirar esse acesso agora violaria o aceite “nenhum papel perde acesso ao que já usava legitimamente”. |
| A auditoria local confirmou que Webhooks, roteadores, credenciais e tokens não são hoje exclusivos da plataforma; esconder apenas os links seria aparência de segurança. | Após a decisão acima: migration + baseline + manifesto, controles positivos/negativos para quatro papéis, URL direta, API, PostgREST e sabotagem de cada guard. | As políticas RLS do baseline e fluxos alternativos de onboarding/credenciais também concedem acesso tenant; uma troca só na interface deixaria o backend aberto ou quebraria caminhos existentes. |

## O que não foi medido

- Não houve alteração nem teste de autorização real, porque faltou a decisão de
  compatibilidade necessária para fazê-la sem retirar acesso legítimo.
- Não foram executados Playwright, `test:db` ou testes de PostgREST nesta branch;
  nenhuma tela, API ou policy foi modificada.
- Não foi consultado o inventário de papéis das organizações de produção.
- Não houve deploy, merge na `main` ou acesso à VPS.

## Living System Checklist — matriz de papéis

- **Quem alimenta:** papéis tenant existentes, atributo `is_platform_admin`,
  registro de navegação, guards de página/API e políticas RLS.
- **Quem eu alimento:** decisões futuras de RBAC e o contrato de venda/suporte;
  esta branch altera documentação, não o runtime.
- **Atividade/log:** não se aplica ainda; nenhuma operação foi criada ou
  ocultada. A implementação futura deverá preservar auditoria de mutações.
- **Onde aparece:** documentação de negócio e visão do produto.
- **Porta:** nenhuma rota ou entrada de navegação nova.
- **Anti-morte:** o documento registra a divergência entre matriz desejada e
  autorização atual, evitando que esconder um link seja confundido com controle.
- **Onde configura:** decisão de política por instalação ainda pendente.
- **Continuidade IA↔humano:** não se aplica à documentação de papéis.
- **Laço de retorno:** os controles positivos futuros devem reprovar se um papel
  legítimo perder acesso, além de negar o acesso indevido.
- **Mapa vivo:** nenhuma peça de runtime nova; o mapa arquitetural não muda.

## Fragmento de mudança

Não há fragmento em `.changes/`: esta branch não muda o que o operador vê ou
consegue fazer. Publicar uma nota de capacidade sem implementar a autorização
seria declarar um comportamento inexistente.
