# Revisão integrada — jornada P0

## Requisitos

Leia o anexo original inteiro: `/Users/juansanches/.codex/attachments/8d68e1e4-8485-4b04-bf52-3228baeda7e7/pasted-text.txt`.
Plano: `docs/superpowers/plans/2026-09-10-jornada-p0-correcao.md`.
Global constraints, ledger e rulings: `.superpowers/sdd/2026-09-10-jornada-p0-correcao/progress.md`.

Base da revisão: `ce973b4a06a56ca69637c52401e3167b631074fb` (altura-shell, ancestral confirmado). A faixa inclui o trabalho original jornada-p0 e a leva corretiva, não reabre os consertos herdados da altura-shell. O head exato e pacote serão informados no despacho.

## O que revisar

Todos os dez itens do anexo, interfaces entre confirmação server-side/roteador/UI/adiamento/convite/fim/reentrada, isolamento de tenant, preservação de configuração existente, cobertura real e sabotagens. Conferir também segurança de artefatos e falhas do harness corrigidas nas rodadas 1–3. Não confundir teste com fronteira controlada com pareamento real.

A revisão é somente leitura, sem agentes filhos, edição, novo worktree, acesso a `.env*`/runtime/credenciais, banco, VPS ou mensagens. Leia o pacote uma vez, e arquivos adicionais somente quando houver dúvida concreta. Não rode suítes completas; resultados estão nos relatórios com comandos e saída. Se houver dúvida sem prova existente, um teste dirigido seguro pode esclarecer.

## Limites já conhecidos, não ocultar no parecer

- Dono não consegue conectar o aparelho agora e autorizou avançar no restante. QR real foi alcançado em instalação fresca sem IA/Resend, com WAHA/Redis vivos, mas o scan não foi confirmado; estado de transporte FAILED, QR expirou. Prova positiva ficou vermelha e nenhuma conclusão foi simulada.
- Essa instalação foi parcialmente consumida; não deve ser resetada/rebatizada como fresca. Nenhum novo pareamento será feito nesta retomada.
- Não há execução dos cinco checks remotos da revisão atual; nenhum PR jornada-p0 aberto. Base PR7 tinha 27 falhas E2E, triadas em `ci-base.md`.
- Relatório de fechamento é explicitamente parcial. A prontidão para merge depende também da prova positiva/CI, mesmo que não haja defeitos restantes encontrados em código.
- Zero diff de schema contra altura-shell; migrations herdadas não pertencem a esta leva.

## Saída

Parecer completo: Strengths; Critical/Important/Minor com arquivo:linha, causa e efeito; avaliação de cada lacuna de aceite; Ready to merge Yes/No/With fixes com razão. Separe defeito de código de aceites ainda não executados. Não transforme a ausência de aparelho em aprovação, e não invente bug para explicar essa ausência. Rulings com crítica técnica se houver.
