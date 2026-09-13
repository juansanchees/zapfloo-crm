"use client";

import { unstable_rethrow } from "next/navigation";
import { useState, useTransition } from "react";
import { explorarCrm, type FalhaAoExplorarCrm } from "@/app/actions/onboarding/explorar";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";

const MENSAGEM_DA_FALHA: Record<FalhaAoExplorarCrm, string> = {
  auth_required: "Sua sessão expirou. Entre novamente para abrir o CRM.",
  no_active_org: "Não encontramos uma empresa ativa para abrir o CRM.",
  forbidden: "Seu acesso não permite abrir esta organização.",
  mfa_required: "Confirme sua verificação de segurança para abrir o CRM.",
  unavailable: "O servidor não conseguiu preparar o CRM. Tente novamente em instantes.",
};

export function ExplorarCrm() {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return <div className="space-y-1">
    <Button variant="outline" size="sm" disabled={pending} onClick={() => {
      setErro(null);
      startTransition(async () => {
        try {
          const result = await explorarCrm();
          if (result?.ok === false) setErro(t(MENSAGEM_DA_FALHA[result.error]));
        }
        catch (cause) {
          // Não trate o controle de navegação do Next como falha de aplicação.
          unstable_rethrow(cause);
          // A exceção crua pode carregar dado sensível. A telemetria recebe só
          // um código canônico; o servidor registra separadamente as recusas esperadas.
          try {
            const Sentry = await import("@sentry/nextjs");
            Sentry.captureException(new Error("onboarding_explore_transport_failed"), {
              tags: { fluxo: "onboarding_explorar_crm" },
            });
          } catch {
            // A indisponibilidade da telemetria nunca pode impedir a saída do
            // onboarding nem substituir a orientação útil mostrada abaixo.
          }
          setErro(t("Não foi possível falar com o servidor. Confira sua conexão e tente novamente."));
        }
      });
    }}>{t(pending ? "Abrindo o CRM…" : "Explorar o CRM")}</Button>
    {erro ? <p role="alert" className="text-sm text-destructive">
      {erro}
    </p> : null}
  </div>;
}
