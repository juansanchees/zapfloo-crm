# Editor de agente simplificado — 12/09/2026

## Escopo

Branch `codex/simplificacao-agentes`, derivada de `origin/main` em `5cd59cb14`.
Esta entrega reduz as decisões obrigatórias do editor sem apagar nenhum campo,
sem mudar schema e sem publicar em produção.

| CONCLUÍDO E TESTADO | PENDENTE | BLOQUEADO |
|---|---|---|
| O agente novo recebe provedor, modelo, melhor credencial ativa, fuso da organização e o único número conectado. Credencial ativa ainda não validada permite criar rascunho, mas continua impedindo publicação. Provas: `configuracao-inicial-do-agente.test.ts` e `agente-novo-e-uso.spec.ts`. | Ampliar pacotes prontos para os demais tipos de negócio; esta leva entrega clínica. | Nenhum bloqueio técnico restante nesta leva. |
| Controles técnicos foram agrupados num único `details` “Avançado”, recolhido por padrão, e continuam editáveis/salvos. Prova: `editor-agente-avancado.test.tsx`. | — | — |
| Clínica reaproveita o pacote canônico `vender`, mostra prévia antes de aplicar e não liga ações críticas. Provas: `preset-clinica-do-agente.test.ts` + jornada real no navegador. | — | — |
| A contagem separa ligadas, teto e catálogo disponível. Prova: `capacidades-do-agente.spec.ts`. | — | — |
| Gates finais: typecheck verde; lint verde com 0 erros e 307 avisos preexistentes; `lint:channels` e `lint:role-rank` verdes; build webpack verde; 756 arquivos/7.881 testes unitários verdes no estado final; 10 cenários do editor de agente + 12 do editor de fluxos verdes no Playwright. | — | — |

## Sabotagens executadas

- Trocar o pacote de clínica de `vender` para `reter` reprova o teste do preset.
- Forçar “Avançado” aberto reprova o teste de estado inicial.
- Neutralizar a troca de provedor reprova a persistência dos seletores.
- Recusar credencial ativa ainda não validada reprova
  `configuracao-inicial-do-agente.test.ts`; restaurar o fallback devolve o verde.
- Trocar a herança do fuso da organização pelo literal de São Paulo reprova o
  teste do editor; restaurar `organizationTimezone` devolve o verde.

## O que não foi medido

- Resposta de um modelo de IA real e envio de WhatsApp real: esta mudança só
  configura o agente; nenhuma mensagem deve sair durante a prova.
- Comportamento em produção: não houve deploy nem acesso à VPS.
- Outros tipos de negócio além de clínica: esta leva deliberadamente entrega
  somente o primeiro preset solicitado.

## Living System Checklist — editor de agente simplificado

- **Quem alimenta:** organização ativa (provedor/fuso), catálogo de modelos,
  credenciais, números conectados e catálogo canônico de capacidades.
- **Quem eu alimento:** o rascunho/versionamento já existente do agente e, quando
  publicado, o runtime do atendimento. Não foi criada uma segunda persistência.
- **Atividade/log:** salvar e publicar continuam usando as actions existentes,
  que mantêm a auditoria já coberta pelos testes do editor; o preset apenas
  altera o mesmo `tool_ids` do formulário.
- **Onde aparece:** `/app/ai/agents/new` e a aba Configuração de
  `/app/ai/agents/[id]`.
- **Porta:** as rotas já estão declaradas em `lib/navigation/registry.ts`; não
  houve tela nova.
- **Anti-morte:** ausência de modelo/credencial não vira campo invisível vazio:
  aparece como alerta com ação para abrir Avançado/cadastrar credencial.
- **Onde configura:** decisões comuns ficam na superfície principal; todos os
  controles técnicos continuam no bloco Avançado.
- **Continuidade IA↔humano:** não se aplica à edição; o handoff configurável
  existente permanece na superfície principal.
- **Laço de retorno:** a aba Capacidades já exibe uso e falhas reais; esta leva
  não altera a telemetria.
- **Mapa vivo:** nenhuma peça ou aresta arquitetural nova; o preset consome os
  módulos canônicos existentes e não exige alteração do mapa.
