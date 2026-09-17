/** Progresso do mês UTC para metas operacionais; não há ranking nesta rota. */
import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { roleAtLeast } from "@/lib/auth/types";
import {
  buildOperationalProgress,
  operationalGoalsFromSettings,
  type ConversationEvent,
  type RevenueEvent,
} from "@/lib/metas/config";
import { createClient } from "@/lib/supabase/server";
import { nomesDosAtendentes } from "@/lib/users/nome-do-atendente";

export const dynamic = "force-dynamic";

export function utcMonthWindow(now = new Date()) {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { from: from.toISOString(), to: to.toISOString() };
}

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "operational_goals" });
  if (!authz.ok) return authz.response;

  const managerView = roleAtLeast(authz.org.role, "manager") || authz.user.is_platform_admin;
  const { from, to } = utcMonthWindow();
  const supabase = await createClient();

  const settingsQuery = supabase
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();

  let rosterQuery = supabase
    .from("user_organizations")
    .select("user_id")
    .eq("organization_id", authz.org.orgId)
    .is("revoked_at", null)
    .not("accepted_at", "is", null)
    .order("created_at", { ascending: true });
  if (!managerView) rosterQuery = rosterQuery.eq("user_id", authz.user.id);

  let revenueQuery = supabase
    .from("crm_leads")
    .select("owner_user_id, value_cents, currency")
    .eq("organization_id", authz.org.orgId)
    .gte("closed_at", from)
    .lt("closed_at", to);
  let conversationsQuery = supabase
    .from("conversations")
    .select("assigned_to_user_id")
    .eq("organization_id", authz.org.orgId)
    .gte("assigned_at", from)
    .lt("assigned_at", to);
  if (!managerView) {
    revenueQuery = revenueQuery.eq("owner_user_id", authz.user.id);
    conversationsQuery = conversationsQuery.eq("assigned_to_user_id", authz.user.id);
  }

  const [settingsRes, rosterRes, revenueRes, conversationsRes] = await Promise.all([
    settingsQuery,
    rosterQuery,
    revenueQuery,
    conversationsQuery,
  ]);
  const error = settingsRes.error ?? rosterRes.error ?? revenueRes.error ?? conversationsRes.error;
  if (error) return fail("internal_error", error.message, 500, { requestId });

  const rosterIds = (rosterRes.data ?? []).map((row) => row.user_id);
  // Não há "outros" no payload de agent. Para manager, o nome vem da fonte
  // autorizada e mínima (`full_name`), nunca de dados de contato.
  const names = managerView ? await nomesDosAtendentes(rosterIds) : new Map<string, string | null>();
  const roster = rosterIds.map((user_id) => ({
    user_id,
    name: managerView ? (names.get(user_id) ?? null) : null,
  }));

  const progress = buildOperationalProgress({
    goals: operationalGoalsFromSettings(settingsRes.data?.settings),
    roster,
    revenue: (revenueRes.data ?? []).map((row) => ({
      user_id: row.owner_user_id,
      value_cents: row.value_cents,
      currency: row.currency,
    })) satisfies RevenueEvent[],
    conversations: (conversationsRes.data ?? []).map((row) => ({
      user_id: row.assigned_to_user_id,
    })) satisfies ConversationEvent[],
  });

  return ok(
    {
      window: { from, to },
      scope: managerView ? "team" : "self",
      ...progress,
    },
    { requestId },
  );
}
