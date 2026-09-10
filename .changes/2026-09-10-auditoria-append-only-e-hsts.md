---
impacto: nada_mudou
secao: corrigido
titulo: A trilha de auditoria passa a ser inalterável de verdade, e o site exige HTTPS
---

- O registro de auditoria não podia mais ser apagado nem reescrito — mas essa garantia existia só na documentação: na prática, qualquer parte do sistema com a chave de serviço podia alterá-lo. Agora a permissão foi retirada no banco. O expurgo automático por tempo de retenção continua funcionando igual.
- O navegador passa a exigir HTTPS no seu domínio por um ano, em vez de aceitar tentar HTTP primeiro. Nada muda para quem já acessa pelo endereço normal.
- O CI passa a reprovar quando alguma biblioteca tem falha de segurança grave conhecida. Antes nenhuma verificação olhava para isso.
