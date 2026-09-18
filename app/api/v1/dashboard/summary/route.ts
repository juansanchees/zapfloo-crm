/**
 * GET /api/v1/dashboard/summary — projeção operacional por papel.
 *
 * Cada leitura é explicitamente tenant-scoped, inclusive com RLS no client
 * user-scoped. Falha em uma fonte remove somente os cartões dependentes: não
 * há fallback para zero ou para números de demonstração.
 */
import { randomUUID } from "node:crypto";

import { ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { roleAtLeast } from "@/lib/auth/types";
import {
  PLANO_PADRAO_DE_ORGANIZACAO_EXISTENTE,
  limiteDoPlano,
  resolverAcessoDaAssinatura,
  type PlanoId,
  type SituacaoDaAssinatura,
} from "@/lib/billing/planos";
import {
  buildRoleSummary,
  type DashboardSources,
  type DashboardSurface,
} from "@/lib/dashboard/role-summary";
import { orgTemAutomatico } from "@/lib/ai/agents/org-tem-automatico";
import { comandosDaFila } from "@/lib/inbox/comando-da-conversa";
import { CONVERSATION_TERMINAL_STATUSES } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type QueryError = { message: string } | null;
type CountResult = { count: number | null; error: QueryError };
type RowsResult<T> = { data: T[] | null; error: QueryError };

interface AttendantMetricRow {
  user_id: string;
  conversations_handled: number;
  avg_first_response_seconds: number | null;
}

interface AttendantMetricsPayload {
  attendants: AttendantMetricRow[];
}

interface LeadValueRow {
  value_cents: number | null;
  currency: string | null;
}

function surfaceFor(role: string, isPlatformAdmin: boolean): DashboardSurface {
  if (isPlatformAdmin || roleAtLeast(role, "admin")) return "admin";
  if (roleAtLeast(role, "manager")) return "manager";
  return "agent";
}

function monthInterval(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

function bucketValues(rows: LeadValueRow[]): Record<string, number> | undefined {
  const grouped: Record<string, number> = {};
  for (const row of rows) {
    // Um valor nulo não pode virar R$ 0: o agregado deixaria de representar
    // todo o conjunto consultado. A fonte fica indisponível de forma honesta.
    if (typeof row.value_cents !== "number" || !row.currency) return undefined;
    grouped[row.currency] = (grouped[row.currency] ?? 0) + row.value_cents;
  }
  return grouped;
}

async function readConversationCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  userId: string,
): Promise<DashboardSources["conversation_counts"]> {
  const automatico = await orgTemAutomatico(supabase, organizationId);
  const count = () =>
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId);
  const [fila, mine] = await Promise.all([
    count().in("comando_da_conversa", comandosDaFila(automatico)),
    count()
      .eq("assigned_to_user_id", userId)
      .not("status", "in", `(${CONVERSATION_TERMINAL_STATUSES.join(",")})`),
  ]);
  const results = [fila, mine] as unknown as CountResult[];
  if (results.some((result) => result.error || result.count === null)) return undefined;
  const queueCount = results[0]?.count;
  const mineCount = results[1]?.count;
  if (typeof queueCount !== "number" || typeof mineCount !== "number") return undefined;
  return {
    fila: queueCount,
    unassigned: queueCount,
    mine: mineCount,
  };
}

async function readOverdueTasks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  now: string,
): Promise<DashboardSources["open_tasks"]> {
  const result = (await supabase
    .from("crm_tasks")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .in("status", ["pending", "in_progress"])
    .lt("due_date", now)) as unknown as CountResult;
  return result.error || result.count === null ? undefined : { overdue: result.count };
}

async function readAttendants(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  interval: ReturnType<typeof monthInterval>,
  ownerUserId: string | null,
  attendantCount?: number,
): Promise<DashboardSources["attendants"]> {
  const result = (await supabase.rpc("fn_attendant_metrics", {
    p_org: organizationId,
    p_from: interval.start,
    p_to: interval.end,
    p_owner: ownerUserId,
  })) as unknown as { data: AttendantMetricsPayload | null; error: QueryError };
  if (result.error || !result.data) return undefined;

  const rows = result.data.attendants ?? [];
  const responseTimes = rows
    .map((row) => row.avg_first_response_seconds)
    .filter((value): value is number => typeof value === "number");
  return {
    // A RPC expõe médias por atendente. Sem a cardinalidade das respostas, a
    // única agregação honesta disponível é a média simples dessas médias.
    first_response_seconds:
      responseTimes.length > 0
        ? responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length
        : null,
    conversations_handled: rows.reduce((sum, row) => sum + row.conversations_handled, 0),
    attendant_count: attendantCount ?? rows.filter((row) => row.conversations_handled > 0).length,
  };
}

async function readManagerSources(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  interval: ReturnType<typeof monthInterval>,
): Promise<Pick<DashboardSources, "pipeline_open" | "won_revenue" | "attendants">> {
  const [openResult, wonResult, attendants] = await Promise.all([
    supabase
      .from("crm_leads")
      .select("value_cents,currency")
      .eq("organization_id", organizationId)
      .eq("status", "open"),
    supabase
      .from("crm_leads")
      .select("value_cents,currency")
      .eq("organization_id", organizationId)
      .eq("status", "won")
      .gte("closed_at", interval.start)
      .lt("closed_at", interval.end),
    readAttendants(supabase, organizationId, interval, null),
  ]);

  const open = openResult as unknown as RowsResult<LeadValueRow>;
  const won = wonResult as unknown as RowsResult<LeadValueRow>;
  const openValues = open.error ? undefined : bucketValues(open.data ?? []);
  const wonValues = won.error ? undefined : bucketValues(won.data ?? []);
  const wonCount = wonValues
    ? Object.fromEntries(Object.entries(wonValues).map(([currency]) => [currency, 0]))
    : undefined;
  if (wonCount && won.data) {
    for (const row of won.data) {
      if (row.currency) wonCount[row.currency] = (wonCount[row.currency] ?? 0) + 1;
    }
  }
  return {
    pipeline_open: openValues ? { value_by_currency: openValues } : undefined,
    won_revenue:
      wonValues && wonCount
        ? { value_by_currency: wonValues, count_by_currency: wonCount }
        : undefined,
    attendants,
  };
}

async function readAdminSources(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  interval: ReturnType<typeof monthInterval>,
): Promise<Pick<DashboardSources, "channels" | "seats" | "attendants">> {
  const [channelsResult, membersResult, subscriptionResult, organizationResult, attendants] =
    await Promise.all([
      supabase
        .from("channel_sessions")
        .select("status")
        .eq("organization_id", organizationId)
        .is("archived_at", null),
      supabase
        .from("user_organizations")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .is("revoked_at", null)
        .not("accepted_at", "is", null),
      supabase
        .from("organization_subscriptions")
        .select("plan_id,status")
        .eq("organization_id", organizationId)
        .maybeSingle(),
      supabase.from("organizations").select("created_at").eq("id", organizationId).maybeSingle(),
      readAttendants(supabase, organizationId, interval, null),
    ]);
  const channels = channelsResult as unknown as RowsResult<{ status: string }>;
  const members = membersResult as unknown as CountResult;
  const subscription = subscriptionResult as unknown as {
    data: { plan_id: string; status: string } | null;
    error: QueryError;
  };
  const organization = organizationResult as unknown as {
    data: { created_at: string } | null;
    error: QueryError;
  };
  const assinatura = subscription.data;
  const planId = (assinatura?.plan_id ?? PLANO_PADRAO_DE_ORGANIZACAO_EXISTENTE) as PlanoId;
  const status = (assinatura?.status ?? "ativo") as SituacaoDaAssinatura;
  const seatLimit =
    subscription.error ||
    organization.error ||
    !organization.data ||
    !(planId in { basico: true, essencial: true, completo: true })
      ? null
      : limiteDoPlano(
          resolverAcessoDaAssinatura({
            plano: planId,
            situacao: status,
            organizacaoCriadaEm: organization.data.created_at,
          }),
          "usuarios",
        );

  return {
    channels:
      channels.error || channels.data === null
        ? undefined
        : {
            online: (channels.data ?? []).filter((channel) => channel.status === "WORKING").length,
            total: (channels.data ?? []).length,
          },
    seats:
      members.error || members.count === null || seatLimit === null
        ? undefined
        : { active: members.count, limit: seatLimit },
    attendants,
  };
}

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", {
    requestId,
    resource: "dashboard_summary",
    // O administrador da plataforma é transversal ao papel salvo no tenant.
    // `surfaceFor` o projeta como admin e o guard canônico precisa permitir a
    // mesma regra, inclusive quando o membership ativo ainda é viewer.
    allowPlatformAdmin: true,
  });
  if (!authz.ok) return authz.response;

  const surface = surfaceFor(authz.org.role, authz.user.is_platform_admin);
  const now = new Date();
  const interval = monthInterval(now);
  const supabase = await createClient();

  let sources: DashboardSources;
  if (surface === "agent") {
    const [conversation_counts, open_tasks, attendants] = await Promise.all([
      readConversationCounts(supabase, authz.org.orgId, authz.user.id),
      readOverdueTasks(supabase, authz.org.orgId, now.toISOString()),
      readAttendants(supabase, authz.org.orgId, interval, authz.user.id),
    ]);
    sources = { conversation_counts, open_tasks, attendants, locale: authz.user.idioma };
  } else if (surface === "manager") {
    sources = {
      ...(await readManagerSources(supabase, authz.org.orgId, interval)),
      locale: authz.user.idioma,
    };
  } else {
    sources = {
      ...(await readAdminSources(supabase, authz.org.orgId, interval)),
      locale: authz.user.idioma,
    };
  }

  const summary = buildRoleSummary(surface, sources);
  return ok(summary, { requestId });
}
