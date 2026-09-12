import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Leads abre a operação; a lista e a gestão dos funis continuam em /app/kanban. */
export default async function LeadsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_pipelines")
    .select("id")
    .eq("organization_id", activeOrg.orgId)
    .eq("is_archived", false)
    .order("is_default", { ascending: false })
    .order("position")
    .order("id")
    .limit(1);

  // Falha de leitura deve chegar ao boundary com retry, nunca simular lista vazia.
  if (error) throw new Error("Falha ao carregar funil para operação de leads.");
  const pipeline = data?.[0];
  // A lista tem o estado vazio com criação (manager+) quando o seed não existe.
  if (!pipeline) redirect("/app/kanban");
  redirect(`/app/pipelines/${pipeline.id}`);
}
