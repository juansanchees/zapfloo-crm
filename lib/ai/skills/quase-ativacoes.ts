import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/** Conta só a telemetria; nenhum conteúdo de conversa sai do banco. */
export async function contarQuaseAtivacoes(
  organizationId: string,
  nomes: string[],
): Promise<Record<string, number>> {
  const admin = createAdminClient();
  const pares = await Promise.all(nomes.map(async (nome) => {
    const { count, error } = await admin.from("skill_activations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("skill_name", nome)
      .eq("trigger", "probe");
    return [nome, error ? 0 : count ?? 0] as const;
  }));
  return Object.fromEntries(pares);
}
