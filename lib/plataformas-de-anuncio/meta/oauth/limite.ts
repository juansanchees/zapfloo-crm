import { NextResponse, type NextRequest } from "next/server";

import { authRateLimited } from "@/lib/auth/rate-limit";
import { traduzir } from "@/lib/i18n/dicionario";
import { LIMITES_OAUTH } from "./limites";

/** Mesmo contador canônico dos webhooks; uso único continua sendo autoridade do Postgres. */
export async function limitarOAuth(
  superficie: string,
  identificador: string | null,
  requestHeaders?: Headers,
): Promise<boolean> {
  try {
    return await authRateLimited(`ads_oauth_${superficie}`, identificador, LIMITES_OAUTH, requestHeaders);
  } catch {
    // Sem contador, não iniciamos uma operação pública que grava credenciais.
    return true;
  }
}

/**
 * O RSC não controla um status HTTP arbitrário. O proxy recusa antes do HTML,
 * de qualquer consulta de organização e da transmissão da metadata por streaming.
 * GET e HEAD compartilham janela; query/prefetch não criam um balde novo.
 */
export async function limitarPaginaOAuth(req: NextRequest, requestId: string): Promise<NextResponse | null> {
  if (req.method !== "GET" && req.method !== "HEAD") return null;
  const segmento = /^\/ads\/connect\/([^/]+)\/?$/.exec(req.nextUrl.pathname)?.[1];
  if (!segmento) return null;
  // Contar ANTES de validar formato/comprimento. Codificar o mesmo segmento
  // em percent-encoding não pode abrir outra janela para a mesma capacidade.
  let token = segmento;
  try { token = decodeURIComponent(segmento); } catch { /* Segmento inválido também é contado. */ }
  if (token === "result") return null;
  if (!await limitarOAuth("link", token, req.headers)) return null;
  const idioma = req.headers.get("accept-language")?.startsWith("es") ? "es" : "pt-BR";
  const texto = traduzir("Muitas tentativas. Aguarde um minuto e tente novamente.", idioma);
  return new NextResponse(req.method === "HEAD" ? null : texto, {
    status: 429,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, private",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Request-Id": requestId,
      "Retry-After": String(LIMITES_OAUTH.windowSec),
    },
  });
}
