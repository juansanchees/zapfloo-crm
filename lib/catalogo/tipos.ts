/** Origem aberta: clones podem conter outros valores, sem CHECK no banco. */
export const ORIGEM_SITE = "site";

/** A mesma trava que o catálogo da IA já usa: rascunho permanece inativo. */
export function produtoDoSiteAguardandoConferencia(produto: {
  origem: string;
  ativo: boolean;
}): boolean {
  return produto.origem === ORIGEM_SITE && !produto.ativo;
}
