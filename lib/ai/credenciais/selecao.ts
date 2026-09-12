/**
 * Fronteira entre administrar o agente e administrar a infraestrutura de IA.
 *
 * O tenant pode salvar uma versão mantendo a credencial que ela já tinha —
 * isto preserva organizações antigas. Escolher, trocar ou remover a credencial
 * é decisão exclusiva da plataforma. Uma versão nova sem antecessora usa null,
 * que aciona a chave da instalação no runtime.
 */
export function podeManterSelecaoDeCredencial(args: {
  isPlatformAdmin: boolean;
  solicitada: string | null | undefined;
  atual: string | null | undefined;
  providerSolicitado?: string;
  providerAtual?: string;
}): boolean {
  if (args.isPlatformAdmin) return true;
  const providerMudou =
    args.providerSolicitado !== undefined &&
    args.providerAtual !== undefined &&
    args.providerSolicitado !== args.providerAtual;
  // Mudar o provedor continua sendo uma decisão do tenant. Nesse caso ele pode
  // omitir a credencial (PATCH direto) ou pedir a seleção gerenciada (`null`);
  // a rota resolve uma chave compatível no servidor. Reaproveitar/enviar UUID
  // nesse mesmo movimento continuaria sendo escolha de infraestrutura.
  if (providerMudou) return args.solicitada === undefined || args.solicitada === null;
  if (args.solicitada === undefined) return true;
  return args.solicitada === (args.atual ?? null);
}
