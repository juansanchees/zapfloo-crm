import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { SetupAiForm } from "./_form";
import { capacidadesPadraoDoOnboarding } from "@/lib/ai/agents/capacidades-padrao";
import { TOOL_CATALOG } from "@/lib/mcp/tools/catalog";
import { CONFERENCIAS_DE_SAIDA } from "@/lib/ai/guardrails/lista-de-conferencia";
import { traduzir } from "@/lib/i18n/dicionario";
import { lerRascunho } from "@/app/actions/onboarding/rascunho";
import { lerEnsaio } from "@/app/actions/onboarding/ensaio";
import { loadOnboardingState } from "@/app/actions/onboarding/_shared";
import { configurarChaveDoOnboarding, gerenciarAgenteDoOnboarding } from "@/app/actions/onboarding/explorar";

export const dynamic = "force-dynamic";

/**
 * O passo que era "Configurar IA" e pedia dois campos.
 *
 * Ele é o coração da experiência: é aqui que a pessoa deixa de configurar um
 * sistema e passa a treinar alguém. Além do nome e do jeito de falar, agora
 * pergunta as REGRAS DA CASA — no botão de criação legado vão para a memória
 * da organização; no salvamento preparatório ficam só no rascunho — e mostra, sem pedir
 * configuração nenhuma, o que ele já vem sabendo fazer e o que nunca vai fazer.
 *
 * As duas listas saem das MESMAS fontes que o runtime usa: as capacidades do
 * pacote que o agente recebe ligado, e as conferências que rodam antes de cada
 * mensagem sair. Escrever essas frases à mão aqui seria a tela prometendo um
 * comportamento que o código não garante.
 */
export default async function SetupAiPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/login");
  const idioma = user.idioma;
  const { state } = await loadOnboardingState(activeOrg.orgId);
  if (!state.welcome) redirect("/onboarding/welcome");
  if (state.ai?.restricted_activation || (state.ai && state.ai.flow !== "reviewed_draft_v2" && !state.ai.skipped)) return (
    <section className="space-y-4"><h2 className="text-2xl font-semibold">{traduzir("Seu agente já foi configurado", idioma)}</h2>
      <form action={gerenciarAgenteDoOnboarding}><button className="rounded-md bg-primary px-4 py-2 text-primary-foreground">{traduzir("Gerenciar agente existente", idioma)}</button></form>
    </section>
  );

  const porNome = new Map(TOOL_CATALOG.map((c) => [c.name, c]));
  const capacidades = capacidadesPadraoDoOnboarding()
    .map((id) => porNome.get(id)?.rotulo)
    .filter((r): r is string => Boolean(r))
    .map((r) => traduzir(r, idioma));

  const conferencias = CONFERENCIAS_DE_SAIDA.map((c) => traduzir(c.rotulo, idioma));
  const rascunho = await lerRascunho();
  const ensaio = rascunho.ok ? await lerEnsaio({ expected_context: rascunho.context }) : { ok: false as const, error: rascunho.error };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">{traduzir("Treine seu funcionário", idioma)}</h2>
        <p className="text-sm text-muted-foreground">
          {traduzir("Quem ele é, como fala e o que pode prometer. Dá para mudar tudo depois.", idioma)}
        </p>
      </header>
      {/* O ensaio usa seu padrão e o acesso disponível automaticamente; não diagnosticar
          o default da organização nem disparar a prova automática do card legado. */}
      <form action={configurarChaveDoOnboarding}>
        <button className="text-sm underline underline-offset-4">{traduzir("Configurar chave de IA", idioma)}</button>
      </form>
      <SetupAiForm key={activeOrg.orgId} negocio={state.welcome.display_name} capacidades={capacidades} conferencias={conferencias} rascunhoInicial={rascunho} ensaioInicial={ensaio} />
    </div>
  );
}
