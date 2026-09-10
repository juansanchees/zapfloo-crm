# Revisão integrada — parecer inicial

Revisor: `p0_review_integrada`, modelo gpt-6-astra/high, somente leitura.
Faixa: `ce973b4a06a56ca69637c52401e3167b631074fb` →
`d8a657030193c49f84ff5dbc17e36f2a623d5e91`.
Pacote completo lido, anexo dos dez itens/plano/rulings conferidos. Sem acesso
a banco/credenciais/VPS, sem alterações. Sondas estreitas em código real com
dependências fictícias, nenhuma suíte reexecutada pelo revisor.

## Important

1. `setup-ai/page.tsx:67` → `createDefaultAgent.ts:509–516`: formulário A chama
   skipAi sem expected_context; cookie trocado em outra aba resolve B. Sonda
   sobre a declaração real produziu orgId B/skipped true. Reusar detector de
   contexto já existente; no conflito, erro acionável sem patch/audit/redirect.
2. `connect-whatsapp/_client.tsx:325–344` → efeito355–357: POST STARTING comUUID,
   erro503/rejeição, GETWORKING semUUID perde a referência de confirmação.
   Sonda dos callbacks reais confirmou autoConfirmBlocked true. PreservarUUID
   também no erro e testar recuperação com confirmação única.
3. `vps-fresh-onboarding.spec.ts:146`, e asserts162–179: matcher recebe registros
   completos no preflight e pode imprimí-los quando o banco não é fresco. O
   matcher instalado imprimiu marcador fictício de e-mail em error.message.
   Guard de snapshot DOM não protege esse erro. Afirmar apenas contagens/
   booleanos; teste adversarial sobre o erro deve impedir vazamento.

## Minor

- `_client.tsx:403` oculta alerta comum em WORKING, mas alternativo556 só existe
  no ramoQR. Ao escolher outra forma e falhar Conferir, a falha fica invisível.
  Condicionar ocultação à renderização efetiva do alertaQR e testar a transição.

## Avaliação

Nenhum Critical adicional confirmado. Confirmação server-side, preservação do
adiamento, ancoragem do gate e segurança do QR foram reconhecidas, com as
ressalvas acima. Sem mudança de schema. Imagens390/1440 inspecionadas mascaramQR.
Os quatro rulings registrados foram considerados coerentes.

**Ready to merge: No.** A onda final deve corrigir os quatro findings e repetir
as verificações pertinentes. Mesmo corrigidos, pareamento real/conclusão/reentrada
frescos e os cinco checks continuam aceites pendentes. GovR5 estava em execução
no despacho; root confirmou depois exit0/755files7914tests, sem atribuir isso
às regressões ainda não escritas. Re-review posterior será restrito aos findings
e ao fixdiff, não uma nova revisão aberta do lote inteiro.

## Re-review restrito — onda final

Faixa `2635081cc..629165e40`, pacote de56.755 bytes lido integralmente pelo
mesmo revisor. Os quatro findings anteriores foram considerados **addressed no
produto**, sem nova quebra Critical/Important no código de produto.

Uma nova quebra Important ficou no E2E: a organização B não tinha concluído
welcome, mas a expectativa após recarregar exigia setup-ai. O guard de produto
corretamente a leva para welcome. A correção proposta foi percorrer boas-vindas,
conexão e IA opcional pela tela antes de adiar, sem inserir marcas no banco.

Faixa posterior `629165e40..6f6bb687d`, pacote de6.157 bytes: correção da sequência
**aprovada em revisão**, preservando os asserts de isolamento, auditoria,
rascunho e390px. Nenhuma nova quebra Critical/Important. O reviewer não executou
testes; a execução E2E isolada continua obrigação do root.

O parecer não aprova merge: pareamento/conclusão/reentrada frescos e cinco checks
remotos continuam pendentes. Os resultados automáticos posteriores devem ser
lidos no relatório consolidado, sem extrapolar este parecer de código.
