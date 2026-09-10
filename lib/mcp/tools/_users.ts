/**
 * Resolução de NOME de usuário (assignee/owner) para os payloads de leitura MCP
 * (G6-03). Dedupe por id — numa listagem de N linhas só resolve K usuários
 * únicos, sem N+1.
 *
 * LGPD (doutrina do repo): expõe SÓ `full_name` do user. NUNCA email, phone,
 * user_metadata completo, tokens ou qualquer outra PII do usuário. Mesmo mínimo
 * que /api/v1/team/assignable já expõe.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { McpContext } from "../types";

export async function resolveUserNames(
  ctx: McpContext,
  userIds: Array<string | null | undefined>,
): Promise<Map<string, string | null>> {
  let unique = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  let supabase = ctx.supabase;
  if (ctx.apiTokenId === "") {
    // A sessão não pode usar Auth Admin. Exceção mínima, como team/assignable:
    // só nomes dos responsáveis das linhas já autorizadas pela RLS, pertencentes
    // à organização confiável do contexto. Este client não sai do resolvedor.
    try {
      supabase = createAdminClient();
      const { data, error } = await supabase.from("user_organizations")
        .select("user_id")
        .eq("organization_id", ctx.organizationId)
        .in("user_id", unique)
        .is("revoked_at", null);
      if (error) return new Map();
      const permitidos = new Set((data ?? []).map((row) => row.user_id));
      unique = unique.filter((id) => permitidos.has(id));
    } catch {
      return new Map();
    }
  }
  const entries = await Promise.all(
    unique.map(async (id): Promise<readonly [string, string | null]> => {
      try {
        const { data } = await supabase.auth.admin.getUserById(id);
        const fullName: unknown = data?.user?.user_metadata?.full_name;
        return [id, typeof fullName === "string" ? fullName : null] as const;
      } catch {
        // Nome é não-crítico: falha de lookup não pode quebrar a leitura.
        return [id, null] as const;
      }
    }),
  );
  return new Map(entries);
}
