"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useT } from "@/hooks/i18n/useT";
import { CheckCircle, ShieldCheck, Warning } from "@/lib/ui/icons";

export function ChannelChoiceGuide() {
  const t = useT();
  return (
    <section aria-labelledby="tipo-de-conexao" className="space-y-3">
      <div>
        <h2 id="tipo-de-conexao" className="text-base font-semibold">{t("Escolha sabendo a diferença")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("A API Oficial e a conexão por QR continuam separadas em todo o sistema. Um número nunca muda de tecnologia sem você reconectar.")}
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="min-w-0 space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 font-medium">
              <ShieldCheck size={20} className="shrink-0 text-success-fg" aria-hidden />
              <span className="break-words">{t("API Oficial da Meta")}</span>
            </div>
            <Badge variant="success">{t("Recomendada para escala")}</Badge>
          </div>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li className="flex gap-2"><CheckCircle size={15} className="mt-0.5 shrink-0" aria-hidden />{t("Canal reconhecido pela plataforma oficial")}</li>
            <li className="flex gap-2"><CheckCircle size={15} className="mt-0.5 shrink-0" aria-hidden />{t("Usa templates aprovados fora da janela de atendimento")}</li>
            <li className="flex gap-2"><CheckCircle size={15} className="mt-0.5 shrink-0" aria-hidden />{t("Token guardado cifrado por organização")}</li>
          </ul>
          <p className="text-xs text-muted-foreground">
            {t("Exige conta comercial, app e número configurados na Meta. Tarifas e aprovação são definidas pela própria Meta.")}
          </p>
        </Card>
        <Card className="min-w-0 space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 font-medium">
              <Warning size={20} className="shrink-0 text-warning-fg" aria-hidden />
              <span className="break-words">{t("Conexão por QR")}</span>
            </div>
            <Badge variant="warning">{t("Requer proteção anti-ban")}</Badge>
          </div>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li>{t("Pareamento rápido pelo celular")}</li>
            <li>{t("Tem aquecimento, limites e ritmo configuráveis")}</li>
            <li>{t("Não é a API Oficial e continua sujeito a bloqueios do WhatsApp")}</li>
          </ul>
          <p className="text-xs text-muted-foreground">
            {t("Use para testes ou operações que aceitam esse risco. A plataforma não promete impedir banimento.")}
          </p>
        </Card>
      </div>
    </section>
  );
}
