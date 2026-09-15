import type { SupabaseClient } from "@supabase/supabase-js";

/** Metadados de validade; esta leitura nunca seleciona nem decifra o token. */
export type MetadadosDeValidade = {
  token_expires_at: string | null;
  data_access_expires_at: string | null;
  token_checked_at: string | null;
  token_type: string | null;
};

export type ValidadeDaConexao = {
  estado: "desconhecida" | "valida" | "expirando" | "expirada";
  venceEm: string | null;
};

function instante(valor: unknown): number | null {
  if (typeof valor !== "string" || !valor.trim()) return null;
  const data = Date.parse(valor);
  return Number.isFinite(data) ? data : null;
}

/** O primeiro dos dois prazos limita a leitura. Ausência não significa validade eterna. */
export function avaliarValidadeDaConexao(
  metadados: Partial<MetadadosDeValidade> | null,
  agora = Date.now(),
): ValidadeDaConexao {
  const prazos = [instante(metadados?.token_expires_at), instante(metadados?.data_access_expires_at)]
    .filter((data): data is number => data !== null);
  if (!prazos.length) return { estado: "desconhecida", venceEm: null };
  const prazo = Math.min(...prazos);
  return {
    estado: prazo <= agora ? "expirada" : prazo - agora <= 7 * 24 * 60 * 60 * 1000 ? "expirando" : "valida",
    venceEm: new Date(prazo).toISOString(),
  };
}

export async function lerValidadeConexao(
  admin: SupabaseClient,
  organizationId: string,
): Promise<ValidadeDaConexao> {
  const { data, error } = await admin
    .from("ad_insights_connections")
    .select("token_expires_at, data_access_expires_at, token_checked_at, token_type")
    .eq("organization_id", organizationId)
    .eq("platform", "meta_ads")
    .maybeSingle();
  return avaliarValidadeDaConexao(error ? null : data as MetadadosDeValidade | null);
}
