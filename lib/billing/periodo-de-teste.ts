/** Prazo comercial: sete dias corridos desde o cadastro da empresa. */
export const DURACAO_TESTE_MS = 7 * 24 * 60 * 60 * 1000;

export function fimDoPeriodoDeTeste(cadastro: string | null | undefined): string | null {
  if (!cadastro) return null;
  const inicio = Date.parse(cadastro);
  const fim = inicio + DURACAO_TESTE_MS;
  if (!Number.isFinite(inicio) || !Number.isFinite(fim) || Math.abs(fim) > 8.64e15) return null;
  return new Date(fim).toISOString();
}

/** Apresentação apenas: vencer o prazo não suspende conta nem inicia cobrança. */
export function tempoRestanteDoTeste(fim: string, agora: number) {
  const restante = Math.max(0, Date.parse(fim) - agora);
  if (!Number.isFinite(restante)) return null;
  const minutos = Math.ceil(restante / 60_000);
  return {
    encerrado: restante === 0,
    dias: Math.floor(minutos / 1440),
    horas: Math.floor((minutos % 1440) / 60),
    minutos: minutos % 60,
  };
}
