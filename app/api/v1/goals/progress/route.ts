/** Progresso do mês UTC para metas operacionais; não há ranking nesta rota. */
import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { roleAtLeast } from "@/lib/auth/types";
import {
  buildOperationalProgress,
  operationalGoalsFromStored,
  parseOperationalGoalMembers,
  storedOperationalGoalsFromSettings,
  type ConversationEvent,
  type RevenueEvent,
} from "@/lib/metas/config";
import { decryptOperationalGoalMembers } from "@/lib/metas/members-cipher";
import { createClient } from "@/lib/supabase/server";
import { nomesDosAtendentes } from "@/lib/users/nome-do-atendente";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 1_000;

export function utcMonthWindow(now = new Date()) {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { from: from.toISOString(), to: to.toISOString() };
}

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", {
    requestId,
    resource: "operational_goals",
    allowPlatformAdmin: true,
  });
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

  const revenuePage = (offset: number, end: number) => {
    let query = supabase
      .from("crm_leads")
      .select("owner_user_id, value_cents, currency")
      .eq("organization_id", authz.org.orgId)
      .eq("status", "won")
      .gte("closed_at", from)
      .lt("closed_at", to);
    if (!managerView) query = query.eq("owner_user_id", authz.user.id);
    // A ordem fixa evita saltar/repetir linhas entre chunks do PostgREST.
    return query.order("id", { ascending: true }).range(offset, end);
  };
  // Atribuir uma conversa não prova atendimento. A fonte canônica é a mensagem
  // outbound com autor humano (`sent_by_user_id`), registrada pelo composer.
  const conversationsPage = (offset: number, end: number) => {
    let query = supabase
      .from("messages")
      .select("conversation_id, sent_by_user_id")
      .eq("organization_id", authz.org.orgId)
      .eq("direction", "outbound")
      .not("sent_by_user_id", "is", null)
      .gte("sent_at", from)
      .lt("sent_at", to);
    if (!managerView) query = query.eq("sent_by_user_id", authz.user.id);
    return query.order("id", { ascending: true }).range(offset, end);
  };

  const [settingsRes, rosterRes, revenueRes, conversationsRes] = await Promise.all([
    settingsQuery,
    rosterQuery,
    fetchEveryPage(revenuePage),
    fetchEveryPage(conversationsPage),
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

  const storedGoals = storedOperationalGoalsFromSettings(settingsRes.data?.settings);
  const members = await readMembers(storedGoals.members_enc);
  if (members === null) return fail("internal_error", "Não foi possível ler as metas individuais.", 500, { requestId });
  const goals = operationalGoalsFromStored(storedGoals, members);
  const ownTarget = goals.members[authz.user.id];
  const scopedGoals = managerView
    ? goals
    : {
        ...goals,
        // O card "Seu resumo" é calculado pela mesma meta da linha individual;
        // meta de equipe não atravessa a fronteira de escopo do agent.
        team: ownTarget ?? {},
        members: ownTarget ? { [authz.user.id]: ownTarget } : {},
      };

  const progress = buildOperationalProgress({
    goals: scopedGoals,
    roster,
    revenue: (revenueRes.data ?? []).map((row) => ({
      user_id: row.owner_user_id,
      value_cents: row.value_cents,
      currency: row.currency,
    })) satisfies RevenueEvent[],
    conversations: (conversationsRes.data ?? []).map((row) => ({
      user_id: row.sent_by_user_id,
      conversation_id: row.conversation_id,
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

async function readMembers(ciphertext: string | undefined) {
  if (!ciphertext) return {};
  const plaintext = decryptOperationalGoalMembers(ciphertext);
  if (!plaintext) return null;
  return parseOperationalGoalMembers(plaintext);
}

type Page<Row> = { data: Row[] | null; error: { message: string } | null };

/** PostgREST limita respostas a `max_rows`; agregação mensal não pode truncar em silêncio. */
async function fetchEveryPage<Row>(
  fetchPage: (offset: number, end: number) => PromiseLike<Page<Row>>,
): Promise<Page<Row>> {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await fetchPage(offset, offset + PAGE_SIZE - 1);
    if (page.error) return { data: null, error: page.error };
    const data = page.data ?? [];
    rows.push(...data);
    if (data.length < PAGE_SIZE) return { data: rows, error: null };
  }
}
