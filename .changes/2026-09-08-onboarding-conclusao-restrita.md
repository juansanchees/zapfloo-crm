---
impacto: capacidade_nova
secao: adicionado
titulo: Ativação segura do agente revisado no primeiro acesso
---

- Confirmar a revisão passa a guardar a prova exata do ensaio atual sem ativar, publicar ou conectar o agente.
- Uma ação explícita separada publica o mesmo agente e a mesma versão ensaiada somente quando o canal escolhido está conectado e fechado em modo de teste por lista de telefones autorizados.
- Repetir a ativação não duplica publicação nem auditoria. Se agente, versão ou canal forem alterados depois, a repetição falha sem desfazer a escolha posterior.
- A transação não chama IA, ferramentas, WhatsApp, HTTP nem cria eventos de contato proativo. O recibo guarda apenas identificadores, hash, modo de acesso e quantidade de testadores — nunca telefones, resposta, prompt ou chave.
