---
impacto: nada_mudou
secao: corrigido
titulo: HTTPS cobre subdomínios e a auditoria não aceita alteração direta
---

O proxy passa a exigir HTTPS também nos subdomínios, sem aderir à lista preload. No banco, a trilha de auditoria recusa alteração, remoção e esvaziamento diretos; o expurgo automático por retenção continua funcionando pelo caminho controlado já existente. O CI também passa a bloquear dependências com vulnerabilidade conhecida de nível alto.
