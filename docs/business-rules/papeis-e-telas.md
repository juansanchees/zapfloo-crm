# Papéis e telas do Zapfloo

> Estado: decisão comercial confirmada; aplicação técnica parcial em 12/09/2026.

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

## Matriz pretendida para o serviço gerenciado

| Área | Atendente | Gerente da clínica | Plataforma |
|---|---:|---:|---:|
| Conversas, contatos, leads e calendário | usar | usar e acompanhar | suporte |
| Painel e relatórios operacionais | consultar | acompanhar | suporte |
| Agentes e automações | não configurar | configurar regras de negócio | suporte técnico |
| Equipe e distribuição diária | usar a própria fila | organizar | suporte técnico |
| Webhooks, credenciais, tokens de API e distribuição técnica de agentes | não ver | não ver | configurar |

## O que o código realmente garante hoje

A navegação e o backend ainda não implementam integralmente a última linha da
matriz pretendida:

- Webhooks e a página de distribuição aceitam `manager` em parte de suas
  operações.
- Credenciais podem ser lidas por `manager` e alteradas pelo `admin` do tenant.
- Tokens de API já exigem `admin` do tenant, não administrador de plataforma.
- O registro de navegação expressa apenas a hierarquia do tenant; escrever
  `minRole: "admin"` **não** significa “somente plataforma”.
- As políticas RLS do banco também concedem capacidades a papéis do tenant.

Portanto, esconder esses links sem alterar página, API, caminhos alternativos e
RLS seria apenas aparência de segurança. A mudança de autorização precisa de uma
decisão explícita sobre instalações existentes e, se confirmada, deve sair numa
migration nova com baseline e manifesto, acompanhada de testes de URL, API e
PostgREST para os quatro papéis.

## Regra para novas telas

Toda superfície declara separadamente:

1. quem enxerga o atalho;
2. quem abre a URL diretamente;
3. quem lê pela API;
4. quem altera pela API ou pelo banco exposto;
5. qual acesso positivo continua legítimo.

Um teste de negação sem o controle positivo correspondente não prova a matriz:
pode apenas ter quebrado a funcionalidade para todos.
