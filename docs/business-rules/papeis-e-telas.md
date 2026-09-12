# Papéis e telas do Zapfloo

> Estado: decisão comercial e implementação confirmadas em 12/09/2026.

## A linguagem usada na venda

| Quem é | Papel do sistema | O que precisa fazer |
|---|---|---|
| Recepcionista ou atendente | `agent` | Conversar, consultar agenda e contatos, acompanhar leads e executar o próximo passo. |
| Dona ou gerente da clínica | `manager` | Acompanhar a operação, organizar o funil, revisar agentes e automações e orientar a equipe. |
| Equipe que opera a plataforma Zapfloo | administrador de plataforma | Configurar integrações e credenciais técnicas, observar todas as organizações e prestar suporte. |

`viewer` é leitura restrita para auditoria ou acompanhamento. O `admin` interno de
uma organização é o **administrador tenant de compatibilidade**: continua
existindo para instalações self-host e para o bootstrap atual, mas não deve ser
confundido com administrador de plataforma, que é uma autoridade transversal
separada (`is_platform_admin`).

## Matriz do serviço gerenciado

| Área | Atendente | Gerente da clínica | Plataforma |
|---|---:|---:|---:|
| Conversas, contatos, leads e calendário | usar | usar e acompanhar | suporte |
| Painel e relatórios operacionais | consultar | acompanhar | suporte |
| Agentes e automações | não configurar | configurar regras de negócio | suporte técnico |
| Equipe e distribuição diária | usar a própria fila | organizar | suporte técnico |
| Webhooks | não configurar | configurar integrações da própria organização | suporte técnico |
| Credenciais de IA e tokens de API | não ver | não ver | configurar |
| Distribuição entre agentes | não configurar | acompanhar quando houver pelo menos dois agentes ativos | suporte técnico; alterações continuam com o admin da organização |

## O que o código garante

A autorização separa autoridade de tenant e de plataforma em quatro fronteiras:

- **Navegação:** credenciais e tokens só são projetados para
  `is_platform_admin`. Distribuição só aparece com dois ou mais agentes ativos.
- **URL direta:** credenciais e tokens redirecionam todos os papéis do tenant
  para `/403`; distribuição continua aberta a `manager` e `admin`, mesmo com um
  único agente, porque a contagem é relevância e não autorização.
- **API:** todas as rotas dedicadas de credenciais e tokens usam a autoridade
  `platformOnly`. Entradas indiretas de versões, provedores, conhecimento e o
  componente legado do onboarding não permitem escolher ou trocar credencial
  pelo tenant. O endereço próprio que recebe a autorização do provedor segue a
  mesma fronteira e não é exposto ao assinante.
- **PostgREST:** a migration 0230 remove as políticas por papel do tenant e
  exige `fn_is_platform_admin()` para as duas tabelas. A mesma migration impede
  que o admin do tenant troque a referência da chave por versões ou bindings,
  ou aponte um binding para endpoint próprio.
  `anon` não recebe privilégio e `service_role` preserva os caminhos internos.

Credenciais já ligadas a versões e pontos de IA são preservadas quando o tenant
edita regras de negócio. Tokens já emitidos continuam sendo validados pelo MCP.
Onboarding e execução do agente continuam usando a chave da instalação ou a
credencial resolvida pelo serviço; a mudança retira administração técnica do
assinante, não a capacidade de atendimento.

## Regra para novas telas

Toda superfície declara separadamente:

1. quem enxerga o atalho;
2. quem abre a URL diretamente;
3. quem lê pela API;
4. quem altera pela API ou pelo banco exposto;
5. qual acesso positivo continua legítimo.

Um teste de negação sem o controle positivo correspondente não prova a matriz:
pode apenas ter quebrado a funcionalidade para todos.
