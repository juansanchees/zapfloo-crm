import type { SupabaseClient } from "@supabase/supabase-js";

import { PROVIDERS, type Provider } from "@/lib/ai/agents/validation";

export type CredencialGerenciada =
  | { ok: true; credentialId: string | null; origem: "organizacao" | "instalacao" }
  | { ok: false; erro: "consulta_falhou" | "indisponivel" };

/**
 * Escolhe a credencial no servidor sem expor lista, rótulo ou últimos dígitos
 * ao tenant. Uma linha validada da organização vence; `null` representa a
 * chave da instalação. O chamador deve passar um client confiável e sempre
 * fornece a organização resolvida da sessão.
 */
export async function resolverCredencialGerenciada(args: {
  db: SupabaseClient;
  organizationId: string;
  provider: Provider;
  instalacaoTemChave: boolean;
}): Promise<CredencialGerenciada> {
  const { data, error } = await args.db
    .from("ai_provider_credentials")
    .select("id")
    .eq("organization_id", args.organizationId)
    .eq("provider", args.provider)
    .eq("is_active", true)
    .not("validated_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false, erro: "consulta_falhou" };
  if (data?.id) {
    return { ok: true, credentialId: String(data.id), origem: "organizacao" };
  }
  if (args.instalacaoTemChave) {
    return { ok: true, credentialId: null, origem: "instalacao" };
  }
  return { ok: false, erro: "indisponivel" };
}

/** Projeção não sensível usada pela tela: somente quais provedores funcionam. */
export async function provedoresComCredencialGerenciada(args: {
  db: SupabaseClient;
  organizationId: string;
  provedoresDaInstalacao: readonly string[];
}): Promise<Provider[]> {
  const { data, error } = await args.db
    .from("ai_provider_credentials")
    .select("provider")
    .eq("organization_id", args.organizationId)
    .eq("is_active", true)
    .not("validated_at", "is", null);
  if (error) return PROVIDERS.filter((provider) => args.provedoresDaInstalacao.includes(provider));

  const disponiveis = new Set<string>(args.provedoresDaInstalacao);
  for (const linha of data ?? []) disponiveis.add(String(linha.provider));
  return PROVIDERS.filter((provider) => disponiveis.has(provider));
}
