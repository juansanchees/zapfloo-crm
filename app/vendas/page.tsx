import type { Metadata } from "next";

import { SalesPage } from "@/components/marketing/SalesPage";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const TITULO = "Zapfloo — Atendente de IA para o WhatsApp do seu negócio";
const DESCRICAO = "A IA responde, marca horário e chama de volta quem sumiu no WhatsApp do seu pet shop, clínica ou salão. Teste grátis por 7 dias.";

export async function generateMetadata(): Promise<Metadata> {
  const base = env.SALES_DOMAIN || env.NEXT_PUBLIC_APP_URL;
  return {
    metadataBase: new URL(base),
    // `absolute` impede que o template global da instalação acrescente a marca
    // do CRM a esta página comercial da Zapfloo.
    title: { absolute: TITULO },
    description: DESCRICAO,
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      url: "/",
      title: TITULO,
      description: DESCRICAO,
      siteName: "Zapfloo",
      images: [{ url: "/icon", alt: "Zapfloo" }],
    },
  };
}

export default function PaginaDeVendas() {
  return <SalesPage whatsappNumber={env.SALES_WHATSAPP_NUMBER} />;
}
