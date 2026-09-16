import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { metaPodeReceber } from "@/lib/channels/meta/webhook";
import { getWahaClient } from "@/lib/waha/client";
import { ConnectWhatsappClient } from "./_client";
import { traduzir } from "@/lib/i18n/dicionario";
import Link from "next/link";
import { lerJornada } from "@/lib/onboarding/jornada";
import { createClient } from "@/lib/supabase/server";
import { listSelectableChannels } from "@/lib/channels/selectable";
import { confirmarAgenteRevisadoSchema } from "@/lib/onboarding/concluir";
import { AutorizacaoRestrita } from "./_autorizacao";
import { ExplorarCrm } from "../_components/ExplorarCrm";
import { lerEnsaio } from "@/app/actions/onboarding/ensaio";
import { podeContinuarAposFalhaDoEnsaio } from "@/lib/onboarding/ensaio";

export const dynamic = "force-dynamic";

export default async function ConnectWhatsappPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/login");
  const idioma = user.idioma;
  const { state, context } = await lerJornada(user.id, activeOrg.orgId);
  if (!state.welcome) redirect("/onboarding/welcome");
  const ensaio = !state.ai ? await lerEnsaio({ expected_context: context }) : null;
  const continuouComIaDesligada = !state.ai && ensaio?.ok === true
    && podeContinuarAposFalhaDoEnsaio(ensaio.panel.proof);
  if (!state.ai && !continuouComIaDesligada) redirect("/onboarding/setup-ai");
  const receipt = state.ai?.restricted_activation;
  if (receipt) return <section className="space-y-4">
    <h2 className="text-2xl font-semibold">{traduzir("Ativação restrita confirmada", idioma)}</h2>
    <p>{traduzir("A versão revisada foi ativada para os números de teste. Nenhuma mensagem foi enviada por essa ação.", idioma)}</p>
    <p className="text-sm text-muted-foreground">{traduzir("O público geral ficou bloqueado nessa ativação. Confira o estado atual e gerencie alterações no CRM.", idioma)}</p>
    <Link href="/onboarding" className="inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground">{traduzir("Continuar", idioma)}</Link>
    <ExplorarCrm />
  </section>;
  const reference = confirmarAgenteRevisadoSchema.safeParse({ expected_context: context, expected_revision: state.ai?.revision, expected_version_id: state.ai?.version_id, run_id: state.ai?.run_id });
  if (!reference.success && !continuouComIaDesligada) return <section className="space-y-4"><h2>{traduzir("Seu agente já foi configurado", idioma)}</h2><p>{traduzir("Continue pelo CRM para gerenciar os canais existentes.", idioma)}</p><ExplorarCrm /></section>;
  const supabase = await createClient();
  let channels: Awaited<ReturnType<typeof listSelectableChannels>> = [];
  let channelsError = false;
  try {
    channels = await listSelectableChannels(supabase, activeOrg.orgId);
  } catch {
    channelsError = true;
  }

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
        {traduzir(continuouComIaDesligada
          ? "Você pode conectar o WhatsApp agora. A IA continuará desligada até o ensaio funcionar e você concluir a ativação."
          : "Este agente ainda não foi ativado. Os canais existentes mantêm suas políticas.", idioma)}
      </p>
      <ConnectWhatsappClient
        wahaConfigured={wahaConfigured}
        sessionName={`org_${activeOrg.orgId.slice(0, 8)}`}
        oficialPodeReceber={oficialPodeReceber}
      />
      {channelsError ? <p role="alert">{traduzir("Não foi possível carregar os canais. Recarregue a página.", idioma)}</p> : reference.success
        ? <AutorizacaoRestrita key={activeOrg.orgId} reference={reference.data} channels={channels.map((c, index) => ({ id: c.id, name: c.display_name || `${traduzir("Canal", idioma)} ${index + 1}`, status: c.status, mode: c.ai_access_mode, count: c.ai_test_phone_count }))} />
        : <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm"><p>{traduzir("A conexão pode ser preparada, mas a IA não será liberada enquanto o ensaio estiver indisponível.", idioma)}</p><Link href="/onboarding/setup-ai" className="mt-2 inline-block underline underline-offset-4">{traduzir("Voltar e testar a IA novamente", idioma)}</Link></div>}
    </div>
  );
}
