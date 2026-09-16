export interface MatcherVisivel {
  any_keywords: string[];
  probe_keywords: string[];
}

/** JSON antigo ou inválido nunca derruba a tela de skills. */
export function matcherVisivel(valor: unknown): MatcherVisivel {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    return { any_keywords: [], probe_keywords: [] };
  }
  const bruto = valor as Record<string, unknown>;
  const lista = (v: unknown) => Array.isArray(v)
    ? [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))]
    : [];
  return { any_keywords: lista(bruto.any_keywords), probe_keywords: lista(bruto.probe_keywords) };
}
