/** Progresso do mês civil da organização para metas operacionais; não há ranking nesta rota. */
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
import { FUSO_PADRAO, fusoValido } from "@/lib/tempo/fusos";
import { nomesDosAtendentes } from "@/lib/users/nome-do-atendente";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 1_000;

type CalendarParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function calendarParts(date: Date, timeZone: string): CalendarParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const values = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return values as CalendarParts;
}

/** Converte meia-noite civil no fuso para o instante UTC correspondente. */
function localMidnightUtc(year: number, month: number, timeZone: string): Date {
  const desiredWallClock = Date.UTC(year, month - 1, 1, 0, 0, 0);
  let instant = desiredWallClock;

  // O offset pode mudar perto da fronteira. Recalcular pelo próprio `Intl`
  // converge sem supor que todo fuso é um múltiplo inteiro de hora.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = calendarParts(new Date(instant), timeZone);
    const observedWallClock = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    const correction = desiredWallClock - observedWallClock;
    if (correction === 0) return new Date(instant);
    instant += correction;
  }

  return new Date(instant);
}

export function monthWindowInTimeZone(now = new Date(), requestedTimeZone?: string | null) {
  const timeZone =
    requestedTimeZone && fusoValido(requestedTimeZone) ? requestedTimeZone : FUSO_PADRAO;
  const current = calendarParts(now, timeZone);
  const nextMonth =
    current.month === 12
      ? { year: current.year + 1, month: 1 }
      : { year: current.year, month: current.month + 1 };
  return {
    from: localMidnightUtc(current.year, current.month, timeZone).toISOString(),
    to: localMidnightUtc(nextMonth.year, nextMonth.month, timeZone).toISOString(),
  };
}

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", {
    requestId,
    resource: "operational_goals",
    allowPlatformAdmin: true,
  });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();

  const settingsRes = await supabase
    .from("organizations")
    .select("settings, timezone")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (settingsRes.error)
    return fail("internal_error", settingsRes.error.message, 500, { requestId });

  const managerView = roleAtLeast(authz.org.role, "manager") || authz.user.is_platform_admin;
  const { from, to } = monthWindowInTimeZone(new Date(), settingsRes.data?.timezone);

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

  const [rosterRes, revenueRes, conversationsRes] = await Promise.all([
    rosterQuery,
    fetchEveryPage(revenuePage),
    fetchEveryPage(conversationsPage),
  ]);
  const error = rosterRes.error ?? revenueRes.error ?? conversationsRes.error;
  if (error) return fail("internal_error", error.message, 500, { requestId });

  const rosterIds = (rosterRes.data ?? []).map((row) => row.user_id);
  // Não há "outros" no payload de agent. Para manager, o nome vem da fonte
  // autorizada e mínima (`full_name`), nunca de dados de contato.
  const names = managerView
    ? await nomesDosAtendentes(rosterIds)
    : new Map<string, string | null>();
  const roster = rosterIds.map((user_id) => ({
    user_id,
    name: managerView ? (names.get(user_id) ?? null) : null,
  }));

  const storedGoals = storedOperationalGoalsFromSettings(settingsRes.data?.settings);
  const members = await readMembers(storedGoals.members_enc);
  if (members === null)
    return fail("internal_error", "Não foi possível ler as metas individuais.", 500, { requestId });
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
