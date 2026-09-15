/** Limites de abuso das entradas OAuth; não substituem validade nem uso único do recibo. */
export const LIMITES_OAUTH = { ip: 60, id: 20, windowSec: 60 } as const;
