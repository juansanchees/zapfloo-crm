import type { SupabaseClient } from "@supabase/supabase-js";

import {
  CHANNEL_SESSION_REF_COLUMNS,
  getAdapter,
  resolveSessionRef,
  type ChannelSessionRef,
} from "@/lib/channels";
import {
  ARCHIVED_AT,
  queryTolerantToMissingArchived,
} from "@/lib/channels/archived";

export type ErroDaConfirmacaoDoCanal =
  | "db_error"
  | "not_found"
  | "channel_archived"
  | "upstream_unavailable"
  | "invalid_state";

export type ResultadoDaConfirmacaoDoCanal =
  | { ok: true; channelSessionId: string }
  | { ok: false; error: ErroDaConfirmacaoDoCanal };

type CanalParaConfirmar = ChannelSessionRef & {
  id: string;
  organization_id: string;
  status: string;
  archived_at?: string | null;
};

/**
 * Confirma um canal da organização perguntando ao transporte no servidor.
 *
 * O espelho no banco pode continuar STARTING enquanto o transporte já responde
 * WORKING; ele serve para localizar provider/ref, não como prova de conclusão.
 */
export async function confirmarCanalConectado(
  db: SupabaseClient,
  input: { organizationId: string; channelSessionId: string },
): Promise<ResultadoDaConfirmacaoDoCanal> {
  const buscar = (colunas: string) =>
    db
      .from("channel_sessions")
      .select(colunas)
      // Service role bypassa RLS: ambos os filtros são obrigatórios, e o tenant
      // vem da sessão revalidada — nunca do argumento enviado pelo navegador.
      .eq("organization_id", input.organizationId)
      .eq("id", input.channelSessionId)
      .maybeSingle();

  let canal: CanalParaConfirmar | null;
  try {
    const { data, error } = await queryTolerantToMissingArchived(
      () =>
        buscar(
          `id, organization_id, status, ${ARCHIVED_AT}, ${CHANNEL_SESSION_REF_COLUMNS}`,
        ),
      () => buscar(`id, organization_id, status, ${CHANNEL_SESSION_REF_COLUMNS}`),
    );
    if (error) return { ok: false, error: "db_error" };
    canal = data as CanalParaConfirmar | null;
  } catch {
    return { ok: false, error: "db_error" };
  }

  // Não revelar se o UUID existe em outro tenant evita transformar a action em
  // oráculo de enumeração de canais.
  if (!canal) return { ok: false, error: "not_found" };
  if (canal.archived_at) return { ok: false, error: "channel_archived" };

  try {
    const adapter = getAdapter(canal.provider);
    const sessionRef = resolveSessionRef(canal);
    if (!adapter.checkHealth || !sessionRef) {
      return { ok: false, error: "upstream_unavailable" };
    }
    const saude = await adapter.checkHealth({
      organizationId: input.organizationId,
      sessionRef,
    });
    if (!saude.reachable) return { ok: false, error: "upstream_unavailable" };
    if (saude.status !== "WORKING") return { ok: false, error: "invalid_state" };
  } catch {
    return { ok: false, error: "upstream_unavailable" };
  }

  return { ok: true, channelSessionId: canal.id };
}
