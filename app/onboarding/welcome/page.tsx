import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { WelcomeForm } from "./_form";
import { NomeDaInstalacao } from "../_components/OnboardingFrame";
import { createClient } from "@/lib/supabase/server";
import { lerRetratoDaInstalacao } from "@/lib/instalacao/retrato";
import { JaEstaPronto } from "../_components/JaEstaPronto";
import { traduzir } from "@/lib/i18n/dicionario";
import { loadOnboardingState } from "@/app/actions/onboarding/_shared";
import { contextoDoRascunho } from "@/lib/onboarding/contexto-rascunho";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/login");
  const idioma = user.idioma;

  const supabase = await createClient();
  const retrato = await lerRetratoDaInstalacao({ supabase, orgId: activeOrg.orgId });
  const { state } = await loadOnboardingState(activeOrg.orgId);

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">
          {traduzir("Boas-vindas ao", idioma)} <NomeDaInstalacao />
        </h2>
        <p className="text-sm text-muted-foreground">
          {traduzir("Vamos montar quem vai atender seus clientes — e onde ele vai trabalhar.", idioma)}
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <a href="#seu-negocio" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{traduzir("Criar meu agente", idioma)}</a>
      </div>

      <JaEstaPronto retrato={retrato} idioma={idioma} />

      {/*
        O instalador NUNCA pergunta o nome do negócio: toda organização nasce
        "Minha Empresa", hardcoded. Mandar esse texto como valor inicial fazia a
        pessoa ter de apagá-lo antes de escrever o nome dela — e quem não
        percebia seguia com o placeholder no cabeçalho do sistema para sempre.
      */}
      <WelcomeForm key={activeOrg.orgId} context={contextoDoRascunho(user.id, activeOrg.orgId)} initial={state.welcome} defaultOrgName={retrato.empresa.aindaSemNomeProprio ? "" : activeOrg.name} />
    </div>
  );
}
