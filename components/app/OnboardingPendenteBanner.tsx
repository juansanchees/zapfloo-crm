"use client";

import Link from "next/link";
import { useT } from "@/hooks/i18n/useT";

export function OnboardingPendenteBanner() {
  const t = useT();
  return <aside className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-muted/50 px-4 py-3 text-sm">
    <p>{t("Você está explorando o CRM. A configuração da organização continua pendente.")}</p>
    <Link href="/onboarding" className="shrink-0 rounded-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">
      {t("Retomar configuração")}
    </Link>
  </aside>;
}
