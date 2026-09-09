import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { metaPodeReceber } from "@/lib/channels/meta/webhook";
import { getWahaClient } from "@/lib/waha/client";
import { ConnectWhatsappClient } from "./_client";
import { traduzir } from "@/lib/i18n/dicionario";
import Link from "next/link";
import { lerJornada } from "@/lib/onboarding/jornada";
import { createClient } from "@/lib/supabase/server";
import { lerModoDeAcessoDaIa, lerNumerosDeTeste } from "@/lib/ai/elegibilidade/pre-go-live";
import { confirmarAgenteRevisadoSchema } from "@/lib/onboarding/concluir";
import { AutorizacaoRestrita } from "./_autorizacao";
import { ExplorarCrm } from "../_components/ExplorarCrm";

export const dynamic = "force-dynamic";

export default async function ConnectWhatsappPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/login");
  const idioma = user.idioma;
  const { state, context } = await lerJornada(user.id, activeOrg.orgId);
  if (!state.welcome) redirect("/onboarding/welcome");
  if (!state.ai) redirect("/onboarding/setup-ai");
  const receipt = state.ai.restricted_activation;
  if (receipt) return <section className="space-y-4">
    <h2 className="text-2xl font-semibold">{traduzir("Ativação restrita confirmada", idioma)}</h2>
    <p>{traduzir("A versão revisada foi ativada para os números de teste. Nenhuma mensagem foi enviada por essa ação.", idioma)}</p>
    <p className="text-sm text-muted-foreground">{traduzir("O público geral ficou bloqueado nessa ativação. Confira o estado atual e gerencie alterações no CRM.", idioma)}</p>
    <Link href="/onboarding" className="inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground">{traduzir("Continuar", idioma)}</Link>
    <ExplorarCrm />
  </section>;
  const reference = confirmarAgenteRevisadoSchema.safeParse({ expected_context: context, expected_revision: state.ai.revision, expected_version_id: state.ai.version_id, run_id: state.ai.run_id });
  if (!reference.success) return <section className="space-y-4"><h2>{traduzir("Seu agente já foi configurado", idioma)}</h2><p>{traduzir("Continue pelo CRM para gerenciar os canais existentes.", idioma)}</p><ExplorarCrm /></section>;
  const supabase = await createClient();
  const { data: channels, error } = await supabase.from("channel_sessions").select("id,display_name,status,metadata").eq("organization_id", activeOrg.orgId).is("archived_at", null).order("created_at");

  const wahaConfigured = getWahaClient() !== null;

  // Receber pelo canal oficial exige DOIS segredos, não um — a regra e o porquê
  // moram em `lib/channels/meta/webhook.ts`, ao lado de quem os consome.
  const oficialPodeReceber = metaPodeReceber();
  // We don't try to start the session at SSR — client kicks off the call
  // (and shows graceful banner if WAHA is not reachable).

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">{traduzir("Dê um telefone a ele", idioma)}</h2>
        <p className="text-sm text-muted-foreground">
          {traduzir(
            "É por este número que ele vai atender seus clientes. Se você conecta pelo celular, tenha ele por perto.",
            idioma,
          )}
        </p>
      </header>
      <p className="text-sm text-muted-foreground">
        {traduzir("Este agente ainda não foi ativado. Os canais existentes mantêm suas políticas.", idioma)}
      </p>
      <ConnectWhatsappClient
        wahaConfigured={wahaConfigured}
        sessionName={`org_${activeOrg.orgId.slice(0, 8)}`}
        oficialPodeReceber={oficialPodeReceber}
      />
      {error ? <p role="alert">{traduzir("Não foi possível carregar os canais. Recarregue a página.", idioma)}</p> : <AutorizacaoRestrita key={activeOrg.orgId} reference={reference.data} channels={(channels ?? []).map((c, index) => ({ id: c.id, name: c.display_name ?? `${traduzir("Canal", idioma)} ${index + 1}`, status: c.status, mode: lerModoDeAcessoDaIa(c.metadata), count: lerNumerosDeTeste(c.metadata).length }))} />}
    </div>
  );
}
