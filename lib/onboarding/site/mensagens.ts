/** Códigos internos não são instruções para quem administra uma clínica. */
const MENSAGENS: Record<string, string> = {
  site_revisao_gravacao_incompleta: "Não consegui salvar a revisão inteira. Abra o material e confira as perguntas novamente.",
  site_revisao_conteudo_alterado: "As perguntas mudaram depois da conferência. Revise e confirme novamente antes de usar o material.",
  "site_preco_ambiguo": "O preço tem mais de uma interpretação. Não importei este produto.",
  "site_preco_conflitante": "Encontrei preços diferentes para o mesmo produto. Não importei nenhum deles.",
  "site_moeda_ausente": "O produto não informa a moeda do preço. Não importei.",
  "site_produto_sem_nome": "O produto não tem nome suficiente para ser identificado.",
  "site_dados_estruturados_invalidos": "Uma parte dos dados deste site está incompleta ou inválida.",
  "site_destino_inseguro": "Este endereço não é um site público permitido. Não fiz a leitura.",
  "site_tempo_limite": "O site demorou para responder. Você pode continuar e tentar de novo depois.",
  "site_sem_conteudo_legivel": "O site não entregou texto que eu consiga ler. Você pode adicionar o conteúdo manualmente.",
  "site_conteudo_nao_html": "Este endereço não entregou uma página de site legível.",
  "site_indisponivel": "O site está indisponível. Você pode continuar e tentar de novo depois.",
  "site_limite_de_leitura": "Cheguei ao limite de páginas desta leitura e parei.",
  "site_limite_de_tamanho": "Esta página é grande demais. Parei a leitura para manter o sistema disponível.",
  "site_limite_de_redirecionamentos": "O site mudou de endereço vezes demais. Parei a leitura.",
  "site_redirecionamento_circular": "O site está redirecionando para ele mesmo. Parei a leitura.",
  "site_redirecionamento_externo": "Não segui um link que levou para outro site.",
  "site_redirecionamento_invalido": "O site indicou um endereço de destino inválido.",
  "site_tentativas_esgotadas": "Não consegui ler este site após três tentativas. Você pode adicionar o conteúdo manualmente em outro material.",
  "site_endereco_alterado": "O endereço do negócio mudou. A leitura anterior não será usada.",
  "site_gravacao_indisponivel": "Não consegui salvar a leitura completa. O conteúdo continua sem aprovação; tente novamente.",
  "site_estado_invalido": "Não consegui recuperar o estado desta leitura. Você pode adicionar outro material manualmente."
};

export function mensagemDoSite(motivo: string): string {
  return MENSAGENS[motivo] ?? "Não consegui ler este site. Você pode continuar e adicionar o conteúdo manualmente.";
}
