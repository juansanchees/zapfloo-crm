# Primeiro acesso — contrato do redesign aprovado

Status: design aprovado pelo usuário; implementação e validação de integração pendentes.

## Origem e escopo

Referência aprovada: protótipo `zapfloo-primeiro-acesso.html` apresentado em
2026-09-08. O protótipo é local, usa respostas pré-escritas e conexão simulada:
aprovação visual não prova persistência, IA real ou segurança do backend.

O trabalho deve acontecer em `codex/onboarding-roxo`, sem deploy, sem usar
credenciais de produção e sem enviar mensagens reais. O primeiro lote corrige
defeitos reproduzidos na base; só depois deve entrar o novo fluxo.

## Jornada aprovada

1. Boas-vindas com uma ação principal para criar o agente e uma saída para
   explorar o CRM. Não confundir exploração com conclusão global do onboarding.
2. Negócio: nome, segmento e descrição do que oferece. Não coletar senhas ou
   dados de clientes nestes campos. Preservar aceite de termos e fuso existentes.
3. Agente: nome, objetivo e tom, com resumo lateral atualizado. Salvar rascunho
   não publica nem ativa o agente.
4. Ensaio: testar uma conversa e revisar a resposta antes de conectar. Alterar
   a configuração invalida a revisão anterior. Falha da IA não pode aparecer
   como teste bem-sucedido; informar se há consumo de API.
5. Conexão: reutilizar os canais existentes. Conectar não é ativar. Começar com
   teste restrito e autorização explícita de contato. O público geral continua
   bloqueado e só pode ser liberado numa ação separada.

Permitir voltar, continuar depois e retomar os dados salvos. Usuário convidado
não pode ser forçado a configurar a organização como se fosse seu dono.
Organizações já configuradas não devem ter seu estado ou atendimento alterados.

## Linguagem visual

- Grafite e roxo, com gradiente roxo/laranja discreto como detalhe, não como
  fundo de leitura de mensagens.
- Resumo contextual ao lado do formulário no desktop; abaixo no celular.
- Hierarquia clara, estados de foco visíveis, controles utilizáveis por
  teclado, rótulos legíveis e confirmação sem depender apenas de cor.
- Marca vem dos resolvedores canônicos de instalação/organização. A logo e a
  cor configuradas pelo operador têm precedência sobre o padrão visual.
- Textos em português e espanhol acompanham a infraestrutura de tradução.
- Não transportar limites de caracteres da prévia para regras de produção
  silenciosamente: confrontar cada campo com o schema e preservar compatibilidade.

## Dependências confirmadas no código

| Superfície | Estado verificado | Consequência |
| --- | --- | --- |
| `lib/onboarding/passos.ts` | Conexão precede agente e ensaio | Inverter a lista isoladamente quebra a jornada |
| `createDefaultAgent.ts` | Tenta publicar; sem canal não cria versão publicada | Criar rascunho precisa ser separado de publicar |
| `app/onboarding/testar/` | Cliente depende de `published_version_id` | Não permite hoje ensaiar o primeiro agente sem canal |
| Rota de teste de versões | Exige versão; grava execução dry-run e chama runtime | Reusar a prova de segurança, não substituir por resposta pré-escrita |
| `ai_agent_versions` no baseline | Canal obrigatório | Projeto de ensaio sem canal precisa resolver persistência e tipos antes da UI |
| `app/app/layout.tsx` | Redireciona organização não concluída para onboarding | Link “explorar” sozinho cria um ciclo de redirecionamento |
| `organizations.onboarding_state` | Compartilhado pela organização | Não usar conclusão global como preferência individual de exploração |

## Critérios de aceitação

- Rascunho e alterações sobrevivem ao retorno; nenhum atendimento é ativado.
- Ensaio falho, indisponível ou referente a configuração antiga não libera a
  confirmação de revisão da configuração atual.
- Contato não autorizado continua bloqueado após conectar e após testes.
- Convidado, usuário sem organização, organização suspensa e organização
  configurada mantêm os guards corretos e não entram em loops.
- Isolamento entre duas organizações provado com banco local real.
- Jornada de primeiro acesso provada no navegador, desktop e celular, com
  evidência visual e dados sintéticos; teste unitário não substitui essa prova.
- Typecheck, lint, unitários, banco, build e testes de UI relevantes passam.

## Estratégia de entrega e reversão

Não substituir o fluxo existente antes de provar os contratos acima. Separar
ensaio/rascunho, navegação e aparência em lotes verificáveis. Se for necessária
mudança de schema, entregar migration nova, apêndice idempotente do baseline e
MANIFEST; não editar migrations aplicadas. Preservar leitura de estados antigos.

Sem publicação nesta etapa, rollback operacional não é necessário. Para uma
futura publicação, manter a imagem anterior e compatibilidade com os dados;
nunca reverter apagando rascunhos, canais ou autorizações do usuário.
