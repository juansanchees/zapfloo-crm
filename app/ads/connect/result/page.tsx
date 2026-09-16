import type { Metadata } from "next";

import { traduzir } from "@/lib/i18n/dicionario";

import { idiomaDaRequisicao } from "../_idioma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: { absolute: traduzir("Conectar com Facebook", await idiomaDaRequisicao()) },
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function ResultadoDaConexaoDeAnuncios({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const [{ status }, idioma] = await Promise.all([searchParams, idiomaDaRequisicao()]);
  const t = (texto: string) => traduzir(texto, idioma);
  const titulo = status === "conectado"
    ? t("Conexão concluída")
    : status === "cancelado"
      ? t("Conexão cancelada")
      : t("Não foi possível conectar");
  const mensagem = status === "conectado"
    ? t("As contas de anúncio foram conectadas. Você pode fechar esta página.")
    : status === "cancelado"
      ? t("A autorização foi cancelada. Peça um novo link à pessoa responsável para tentar novamente.")
      : t("A conexão não foi concluída. Peça um novo link à pessoa responsável e tente novamente.");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-10 text-foreground">
      <section role="status" className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold">{titulo}</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">{mensagem}</p>
      </section>
    </main>
  );
}
