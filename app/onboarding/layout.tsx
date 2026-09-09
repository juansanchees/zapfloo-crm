import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { requireRole } from "@/lib/auth/require-role";
import { lerJornada } from "@/lib/onboarding/jornada";
import { OnboardingFrame } from "./_components/OnboardingFrame";
import { OutrasOrganizacoes } from "./_components/OutrasOrganizacoes";
import { SkipToEnd } from "./_components/SkipToEnd";
import { ExplorarCrm } from "./_components/ExplorarCrm";
import { passosVisiveis } from "@/lib/onboarding/passos";
import { env } from "@/lib/env";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  // Sem organização o onboarding não tem o que mostrar — mas mandar para
  // `/login` fechava o círculo: quem entrasse de novo voltaria para cá. A saída
  // é a tela que CRIA a organização que falta.
  if (!activeOrg) redirect("/get-started");
  if (activeOrg.role !== "admin") redirect("/app/inbox");
  const authz = await requireRole("admin", { resource: "onboarding" });
  if (!authz.ok) {
    const { error } = await authz.response.json();
    if (error.code === "mfa_required") redirect("/login/mfa");
    // Erro ao revalidar a permissão não pode criar um ciclo app ↔ wizard.
    redirect("/login");
  }

  const { state, onboardedAt } = await lerJornada(user.id, activeOrg.orgId);
  if (onboardedAt) redirect("/app/inbox");

  // Os passos que ESTA instalação oferece, com o que já foi resolvido. O
  // indicador não decide mais nada sozinho — ele desenha o que recebe.
  const passos = passosVisiveis({ lojaLigada: env.NUVEMSHOP_ENABLED }).map((p) => ({
    segmento: p.segmento,
    rotulo: p.rotulo,
    cumprido: p.cumprido(state),
  }));

  const isDev = process.env.NODE_ENV !== "production";

  return (
    <IdiomaProvider locale={user.locale}>
      <OnboardingFrame orgName={activeOrg.name} passos={passos} controls={
            <>
              <ExplorarCrm />
              {/*
                A SAÍDA, para quem tem outra organização. Ver o cabeçalho de
                `OutrasOrganizacoes`: sem ela, trocar de organização pelo seletor
                do topo levava a um wizard sem porta de volta — o layout de `/app`
                sai da árvore e leva o `TenantSwitcher` junto.
              */}
              <OutrasOrganizacoes
                outras={user.organizations
                  .filter((o) => o.organization_id !== activeOrg.orgId)
                  .map((o) => ({ id: o.organization_id, nome: o.organization_name }))}
              />
              {isDev ? <SkipToEnd /> : null}
            </>
      }>{children}</OnboardingFrame>
    </IdiomaProvider>
  );
}
