"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { skipAi } from "@/app/actions/onboarding/createDefaultAgent";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";

export function AdiarIa({ expectedContext }: { expectedContext: string }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <form
        action={() => {
          setErro(null);
          startTransition(async () => {
            const result = await skipAi({ expected_context: expectedContext });
            if (result?.ok === false) {
              setErro("A organização ativa mudou. Recarregue esta etapa antes de adiar a IA.");
            }
          });
        }}
      >
        <Button type="submit" variant="outline" disabled={pending}>
          {t(pending ? "Adiando IA…" : "Adiar IA e continuar")}
        </Button>
      </form>
      {erro ? (
        <p role="alert" className="text-sm text-destructive">
          {t(erro)}{" "}
          <Link href="/onboarding/setup-ai" className="font-medium underline underline-offset-4">
            {t("Recarregar esta etapa")}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
