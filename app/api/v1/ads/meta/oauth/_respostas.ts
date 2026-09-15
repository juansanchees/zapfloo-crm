import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { env } from "@/lib/env";
import { traduzir } from "@/lib/i18n/dicionario";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { cookieSecure } from "@/lib/supabase/cookie-secure";

export const CABECALHOS_PRIVADOS = {
  "Cache-Control": "no-store, private",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

/** O prefixo Host impede que outro subdomínio plante o cookie de vínculo. */
export function nomeCookie(requestId: string): string {
  return `${cookieSecure() ? "__Host-" : ""}ads_oauth_bind_${requestId}`;
}

export function origemConfere(req: NextRequest): boolean {
  return req.headers.get("origin") === new URL(env.NEXT_PUBLIC_APP_URL).origin;
}

export function textoOAuth(req: NextRequest, texto: string) {
  return traduzir(texto, normalizarIdioma(req.headers.get("accept-language")?.startsWith("es") ? "es" : "pt-BR"));
}

export function erroOrigem(req: NextRequest) {
  return fail("forbidden_origin", textoOAuth(req, "Origem da solicitação não autorizada."), 403, { headers: CABECALHOS_PRIVADOS });
}

export function erroLimite(req: NextRequest) {
  return fail("rate_limited", textoOAuth(req, "Muitas tentativas. Aguarde um minuto e tente novamente."), 429, {
    headers: { ...CABECALHOS_PRIVADOS, "Retry-After": "60" },
  });
}

/** Recusa durante a leitura, inclusive sem Content-Length (transfer chunked). */
export async function lerCorpoLimitado(req: NextRequest, maxBytes: number): Promise<string | null> {
  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > maxBytes || !req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let tamanho = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      tamanho += chunk.value.byteLength;
      if (tamanho > maxBytes) return null;
      chunks.push(chunk.value);
    }
    const buffer = new Uint8Array(tamanho);
    let posicao = 0;
    for (const chunk of chunks) { buffer.set(chunk, posicao); posicao += chunk.byteLength; }
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return null;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function redirecionarInicio(inicio: { url: string; vinculo: string; requestId: string }) {
  // 303: nunca repetir o POST (nem seu body com link) no domínio externo.
  const resposta = NextResponse.redirect(inicio.url, { status: 303, headers: CABECALHOS_PRIVADOS });
  resposta.cookies.set(nomeCookie(inicio.requestId), inicio.vinculo, {
    httpOnly: true, sameSite: "lax", secure: cookieSecure(), path: "/", maxAge: 600,
  });
  return resposta;
}

export function falhaInicio(agencia: boolean) {
  const caminho = agencia ? "/ads/connect/result?status=erro" : "/app/settings/meta-ads?oauth=erro";
  return NextResponse.redirect(new URL(caminho, env.NEXT_PUBLIC_APP_URL), {
    status: 303, headers: CABECALHOS_PRIVADOS,
  });
}

/**
 * Mesmo desenho da Agenda: o HTML 200 interrompe a cadeia cross-site antes
 * de voltar ao app, cujos cookies são Strict. Nunca baixar a sessão para Lax.
 * Só status locais entram no HTML: nem code, state, URL da rede ou token.
 */
export function terminarOAuth(
  req: NextRequest,
  status: "conectado" | "cancelado" | "erro",
  agencia: boolean,
  requestId?: string,
) {
  const path = agencia ? `/ads/connect/result?status=${status}` : `/app/settings/meta-ads?oauth=${status}`;
  const destino = new URL(path, env.NEXT_PUBLIC_APP_URL).toString();
  const scriptNonce = randomBytes(18).toString("base64");
  const idioma = normalizarIdioma(req.headers.get("accept-language")?.startsWith("es") ? "es" : "pt-BR");
  const continuar = traduzir("Continuar", idioma);
  const href = destino.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const resposta = new NextResponse(
    `<!doctype html><html lang="${idioma}"><head><meta charset="utf-8">` +
    `<meta name="referrer" content="no-referrer"><title>${continuar}</title></head><body>` +
    `<a href="${href}">${continuar}</a>` +
    `<script nonce="${scriptNonce}">location.replace(${JSON.stringify(destino).replace(/</g, "\\u003c")})</script>` +
    `</body></html>`, {
      status: 200,
      headers: {
        ...CABECALHOS_PRIVADOS, "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${scriptNonce}'; base-uri 'none'; frame-ancestors 'none'`,
      },
    },
  );
  if (requestId) resposta.cookies.set(nomeCookie(requestId), "", {
    httpOnly: true, sameSite: "lax", secure: cookieSecure(), path: "/", maxAge: 0,
  });
  return resposta;
}
