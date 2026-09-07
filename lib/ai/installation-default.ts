export const PROVEDORES_DA_INSTALACAO = [
  "anthropic",
  "openai",
  "openrouter",
  "google",
] as const;

export type ProvedorDaInstalacao = (typeof PROVEDORES_DA_INSTALACAO)[number];

/** Valor seguro para organizações novas; lixo de operador nunca derruba o app. */
export function provedorPadraoDaInstalacao(
  valor: string | undefined = process.env.AI_PROVIDER,
): ProvedorDaInstalacao {
  const normalizado = (valor ?? "").trim().toLowerCase();
  return (PROVEDORES_DA_INSTALACAO as readonly string[]).includes(normalizado)
    ? (normalizado as ProvedorDaInstalacao)
    : "anthropic";
}

/**
 * Semeia só o provider. O trigger do banco escolhe o modelo marcado como
 * padrão daquele provider; manter essa escolha no catálogo evita duas fontes.
 */
export function configuracaoInicialDeLlm(
  settings: Record<string, unknown> = {},
  valor?: string,
): Record<string, unknown> {
  const llm =
    settings.llm && typeof settings.llm === "object" && !Array.isArray(settings.llm)
      ? (settings.llm as Record<string, unknown>)
      : {};
  return {
    ...settings,
    llm: { ...llm, provider: provedorPadraoDaInstalacao(valor) },
  };
}
