# Planos por organização

## Fonte única

Preços, tetos mensais de IA, limites e recursos vivem em
`lib/billing/planos.ts`. A assinatura persistida guarda apenas `plan_id` e
`status`; o significado desses valores não é copiado para JSON da organização.

Organizações novas nascem em `teste`. Durante 168 horas, recebem os recursos do
Completo e teto de IA de US$ 4,00, o mesmo do Básico. Organizações que já existiam
quando a tabela entrou receberam `completo + ativo`, somente quando ainda não
tinham linha. Reaplicar o baseline não muda uma escolha já editada.

## Living System Checklist — planos

- Quem alimenta: o administrador da plataforma, pela edição em `/admin/tenants/[id]`.
- Quem é alimentado: as APIs de criação, o resolvedor de orçamento de IA e as telas que substituem ações indisponíveis pela indicação do plano mínimo.
- Atividade: toda troca de plano ou situação grava `tenant.subscription_changed` em `api_audit_log`.
- Tela: lista e detalhe de Tenants mostram plano e situação; as telas do cliente mostram a indisponibilidade no ponto da ação.
- Porta: o painel já é alcançado por `/admin/tenants`; nenhuma nova página autenticada foi criada.
- Anti-morte: teste vencido e assinatura pausada mantêm o CRM e as criações previstas no plano acessíveis; somente a IA é interrompida, sem apagar recursos.
- Configuração: plano e situação são vistos e alterados no detalhe do tenant por administrador de plataforma.
- Continuidade IA↔humano: uma recusa de orçamento é terminal e o caminho do worker continua encaminhando a demanda ao humano.
- Laço de retorno: consumo de `llm_calls` alimenta a mesma decisão de orçamento da chamada seguinte; troca de situação é refletida na próxima resolução.
- Mapa vivo: `docs/architecture/planos-por-organizacao.architecture.json` descreve configuração, persistência e consumo.
