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

export const dynamic = "force-dynamic";

export default async function ConnectWhatsappPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/login");
  const idioma = user.idioma;
  const { state, context } = await lerJornada(user.id, activeOrg.orgId);
  if (!state.welcome) redirect("/onboarding/welcome");
  const receipt = state.ai?.restricted_activation;
  if (receipt) return <section className="space-y-4">
    <h2 className="text-2xl font-semibold">{traduzir("Ativação restrita confirmada", idioma)}</h2>
    <p>{traduzir("A versão revisada foi ativada para os números de teste. Nenhuma mensagem foi enviada por essa ação.", idioma)}</p>
    <p className="text-sm text-muted-foreground">{traduzir("O público geral ficou bloqueado nessa ativação. Confira o estado atual e gerencie alterações no CRM.", idioma)}</p>
    <Link href="/onboarding" className="inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground">{traduzir("Continuar", idioma)}</Link>
  </section>;
  // A revisão autoriza somente a oferta de ativação restrita, não a conexão.
  // Ausência de IA (ou decisão de adiar) não bloqueia atendimento humano.
  const reference = confirmarAgenteRevisadoSchema.safeParse({ expected_context: context, expected_revision: state.ai?.revision, expected_version_id: state.ai?.version_id, run_id: state.ai?.run_id });
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
        <h2 className="text-2xl font-semibold tracking-tight">{traduzir("Conecte seu WhatsApp", idioma)}</h2>
        <p className="text-sm text-muted-foreground">
          {traduzir(
            "Conecte um número para sua equipe atender. Não precisa configurar IA para conectar.",
            idioma,
          )}
        </p>
      </header>
      <p className="text-sm text-muted-foreground">
        {traduzir("Novos canais começam em modo de teste, sem números autorizados para IA. Conectar não ativa a IA nem altera as políticas dos canais existentes.", idioma)}
      </p>
      <ConnectWhatsappClient
        wahaConfigured={wahaConfigured}
        sessionName={`org_${activeOrg.orgId.slice(0, 8)}`}
        oficialPodeReceber={oficialPodeReceber}
        canaisIniciais={channels.map((canal) => ({
          id: canal.id,
          nome: canal.display_name,
        }))}
      />
      {channelsError && <p role="alert">{traduzir("Não foi possível carregar os canais. Recarregue a página.", idioma)}</p>}
      <section className="min-w-0 space-y-3 rounded-xl border p-4 sm:p-6">
        <h3 className="text-lg font-semibold">{traduzir("Atendimento humano primeiro", idioma)}</h3>
        <p className="text-sm text-muted-foreground">{traduzir("Você pode abrir as conversas agora. Para enviar e receber pelo WhatsApp, o número precisa estar conectado. A configuração restante pode ser retomada depois.", idioma)}</p>
        <Link href="/onboarding/setup-ai" className="block text-sm underline underline-offset-4">{traduzir("Configurar IA (opcional)", idioma)}</Link>
      </section>
      {!channelsError && !state.ai?.skipped && reference.success && <AutorizacaoRestrita key={activeOrg.orgId} reference={reference.data} channels={channels.map((c, index) => ({ id: c.id, name: c.display_name || `${traduzir("Canal", idioma)} ${index + 1}`, status: c.status, mode: c.ai_access_mode, count: c.ai_test_phone_count }))} />}
    </div>
  );
}
