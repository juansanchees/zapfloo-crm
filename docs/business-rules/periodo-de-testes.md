# Período de testes — apresentação

Solicitação: mostrar que a empresa está em teste, quanto tempo falta e quando termina. Duração aprovada pelo dono: sete dias.

Referência adotada nesta entrega: `organizations.created_at`, em UTC. O vencimento é derivado somando 168 horas; não existe uma segunda data gravada para divergir. Empresas já cadastradas usam o cadastro original, sem reinício ou backfill. Operadores convidados compartilham o prazo da empresa, não recebem um prazo por login. O instante de início foi apresentado ao usuário como cadastro, pendente de eventual correção da preferência.

O componente `PeriodoDeTeste` recebe somente o vencimento e o relógio inicial. `AppLayout` reutiliza a leitura da organização validada; onboarding usa o cliente autenticado com RLS e filtro pelo id resolvido no guard. O administrador vê a mesma regra em `TenantOverview`.

O texto apresenta a data absoluta em horário de Brasília e atualiza o tempo restante. Datas ausentes ou inválidas produzem aviso de consulta indisponível, sem fabricar prazo. Chegar a zero mostra “Seu período de testes terminou”. Esta entrega é informativa: não comprova pagamento, não cobra, não suspende, não libera e não revoga permissões. Antes de ativar faturamento, o estado comercial de assinatura deverá substituir a apresentação de teste para empresas pagantes; `settings.plan` sozinho não é comprovante de pagamento.

Verificação: testes de limites de tempo, virada de ano, falha de leitura e atualização do componente; jornada visual local com login, recarga e tela de conversas. O escopo não muda schema, policies ou permissões.
