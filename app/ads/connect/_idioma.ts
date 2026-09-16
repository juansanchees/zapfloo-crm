import { headers } from "next/headers";

import { normalizarIdioma, type Idioma } from "@/lib/i18n/idiomas";

/** O destinatário do link não precisa de conta; idioma não consulta sessão ou tenant. */
export async function idiomaDaRequisicao(): Promise<Idioma> {
  const preferidos = (await headers()).get("accept-language")?.split(",") ?? [];
  const suportado = preferidos
    .map((preferencia, ordem) => {
      const [codigo = "", ...parametros] = preferencia.trim().toLowerCase().split(";");
      const peso = parametros.find((parametro) => parametro.trim().startsWith("q="));
      return { codigo, ordem, peso: peso ? Number(peso.trim().slice(2)) : 1 };
    })
    .filter(({ codigo, peso }) => /^(?:es|pt)(?:-|$)/.test(codigo) && peso > 0 && peso <= 1)
    .sort((a, b) => b.peso - a.peso || a.ordem - b.ordem)[0];

  return normalizarIdioma(suportado?.codigo.startsWith("es") ? "es" : "pt-BR");
}
