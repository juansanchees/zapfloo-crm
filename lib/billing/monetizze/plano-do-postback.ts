import type { PlanoId } from "@/lib/billing/planos";

export type ReferenciasDePlanoMonetizze = Record<PlanoId, string>;

type CamposDoPostback = {
  get(nome: string): string | null;
};

/**
 * Resolve o plano pela identidade própria do plano no contrato da Monetizze.
 * Um único produto pode ter vários planos mensais; por isso produto[codigo]
 * e nomes apresentados ao comprador não participam desta decisão.
 */
export function resolverPlanoIdDoPostback(
  campos: CamposDoPostback,
  referencias: ReferenciasDePlanoMonetizze,
): PlanoId | null {
  const referenciaRecebida = campos.get("plano[referencia]")?.trim();
  if (!referenciaRecebida) return null;

  const correspondencias = (Object.entries(referencias) as Array<[PlanoId, string]>)
    .filter(([, referencia]) => referencia.trim() !== "" && referencia.trim() === referenciaRecebida)
    .map(([plano]) => plano);

  // Configuração duplicada é ambígua: falha fechada e deixa o evento para
  // conciliação, em vez de ativar um plano por ordem de objeto.
  return correspondencias.length === 1 ? correspondencias[0]! : null;
}
