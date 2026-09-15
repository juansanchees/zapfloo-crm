import type { Metadata } from "next";

import { traduzir } from "@/lib/i18n/dicionario";
import { configuracaoOAuth } from "@/lib/plataformas-de-anuncio/meta/oauth/config";
import { lerPaginaDoLink, limitarOAuth } from "@/lib/plataformas-de-anuncio/meta/oauth/servico";

import { idiomaDaRequisicao } from "../_idioma";

// Link de capacidade: nenhum HTML com o nome da organização pode virar cache compartilhado.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: { absolute: traduzir("Conectar com Facebook", await idiomaDaRequisicao()) },
    robots: { index: false, follow: false },
    // Preserva Origin no POST nativo, mas nunca envia o caminho com o link assinado no Referer.
    // no-referrer transformaria Origin em null; o redirecionamento externo mantém no-referrer.
    referrer: "strict-origin",
  };
}

export default async function ConectarAnunciosPorLink({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [{ token }, idioma] = await Promise.all([params, idiomaDaRequisicao()]);
  const t = (texto: string) => traduzir(texto, idioma);
  const bloqueado = await limitarOAuth("link", token);
  const configurado = configuracaoOAuth();
  const pagina = bloqueado || !configurado ? { ok: false as const } : await lerPaginaDoLink(token);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-10 text-foreground">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm sm:p-8">
        {pagina.ok ? (
          <>
            <h1 className="break-words text-2xl font-bold">{pagina.nome}</h1>
            <form action="/api/v1/ads/meta/oauth/agency" method="post" className="mt-6">
              <input type="hidden" name="link" value={token} />
              <button
                type="submit"
                className="min-h-11 w-full rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {t("Conectar com Facebook")}
              </button>
            </form>
          </>
        ) : (
          <p role="status" className="text-base leading-7 text-muted-foreground">
            {bloqueado || !configurado
              ? t("A conexão está temporariamente indisponível. Tente novamente mais tarde.")
              : t("Este link de conexão está indisponível. Peça um novo link à pessoa responsável.")}
          </p>
        )}
      </section>
    </main>
  );
}
