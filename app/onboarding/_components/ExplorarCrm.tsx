"use client";

import { useState, useTransition } from "react";
import { explorarCrm } from "@/app/actions/onboarding/explorar";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";

export function ExplorarCrm() {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState(false);
  return <div className="space-y-1">
    <Button variant="outline" size="sm" disabled={pending} onClick={() => {
      setErro(false);
      startTransition(async () => {
        try { await explorarCrm(); }
        catch { setErro(true); }
      });
    }}>{t(pending ? "Abrindo o CRM…" : "Explorar o CRM")}</Button>
    {erro ? <p role="alert" className="text-sm text-destructive">
      {t("Não foi possível abrir o CRM. Recarregue a página e tente novamente.")}
    </p> : null}
  </div>;
}
