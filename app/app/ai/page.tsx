import { NavHub } from "@/components/shell/NavHub";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Hub da área de IA.
 *
 * Substitui as abas que só apareciam para quem JÁ estava dentro de `/app/ai/*`:
 * Conhecimento, Credenciais, Uso, Casos e Alertas eram invisíveis de qualquer
 * outro lugar do sistema. Aqui as dez telas aparecem juntas, na jornada de quem
 * opera um agente — montar, ensinar, acompanhar.
 */
export default async function AiHubPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  const { count } = activeOrg
    ? await createAdminClient()
        .from("ai_agents")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", activeOrg.orgId)
        .eq("is_active", true)
        .is("archived_at", null)
    : { count: 0 };

  return (
    <NavHub
      group="ia"
      isPlatformAdmin={user.is_platform_admin}
      role={activeOrg?.role ?? null}
      activeAgentCount={count ?? 0}
      title="Agente de IA"
      subtitle="Tudo que define quem atende por você — e como acompanhar o que ele faz."
    />
  );
}
