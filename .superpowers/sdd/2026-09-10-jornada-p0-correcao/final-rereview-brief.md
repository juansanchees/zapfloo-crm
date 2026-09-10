# Re-review restrito da onda final

Reusar o parecer de `final-review-report.md`. Revisar somente os quatro findings
e o diff de correção a partir de `2635081cc`; o head exato e o pacote serão
informados no despacho. Não reabrir a revisão ampla nem executar suítes inteiras.

1. Adiamento: contexto da página capturado, revalidado contra usuário/tenant
   confiáveis antes de load/patch/audit/redirect; conflito acionável e recuperação
   que realmente atualiza a página. Testes A→B não podem alterar B silenciosamente.
2. Polling: UUID preservado em HTTP503 e rejeição; recuperação em WORKING confirma
   uma vez, sem repetição de mutações em erro.
3. Preflight: registros pessoais não são argumentos de matchers; controle sobre
   a versão instalada do Playwright e sabotagem no código real devem guardar a
   ausência de marcador sensível no erro.
4. Alerta: erro permanece visível fora do ramo QR após WORKING, inclusive escolha,
   formulário oficial e parceiro. Não apenas mudar a mensagem.

Somente leitura, sem subagentes, credenciais, banco, novo pareamento, mensagem,
main, PR, merge, deploy ou VPS. O executor é o mesmo da Task2; o root consolida
gov, DB e E2E em perfil local separado. Leia `final-fix-report.md` e a evidência
consolidada indicada no despacho; não extrapole testes dirigidos para a suíte.

Informe cada finding como addressed/unaddressed e somente novas quebras
Critical/Important introduzidas pelo fixdiff. Mesmo com todos addressed, os
aceites de pareamento real/conclusão/reentrada fresca e CI remoto continuam
pendentes. Nenhuma nova tentativa de scan foi autorizada nesta retomada.
