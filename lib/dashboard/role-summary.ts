/**
 * Projeção pura do painel. A rota coleta e valida as fontes; este módulo nunca
 * consulta banco nem aplica regra de autorização. Assim, uma fonte indisponível
 * não é confundida com uma métrica igual a zero.
 */
export type DashboardSurface = "agent" | "manager" | "admin";

export type DashboardIcon =
  | "users"
  | "timer"
  | "chat"
  | "warning"
  | "money"
  | "trend"
  | "receipt"
  | "shield"
  | "whatsapp"
  | "seat";

export interface DashboardCard {
  id: string;
  label: string;
  value: string | number;
  variation: string;
  hint: string;
  icon: DashboardIcon;
}

export interface DashboardOmission {
  id: string;
  reason: "source_unavailable" | "multiple_currencies" | "limit_unavailable";
}

export interface DashboardSummary {
  role_surface: DashboardSurface;
  hero: DashboardCard;
  cards: DashboardCard[];
  omitted: DashboardOmission[];
}

export interface DashboardSources {
  conversation_counts?: {
    fila?: number;
    unassigned?: number;
    mine: number;
    all?: number;
  };
  open_tasks?: { overdue: number };
  attendants?: {
    first_response_seconds: number | null;
    conversations_handled: number;
    attendant_count: number;
  };
  locale?: string;
  pipeline_open?: {
    value_by_currency: Record<string, number>;
  };
  won_revenue?: {
    value_by_currency: Record<string, number>;
    count_by_currency: Record<string, number>;
  };
  channels?: { online: number; total: number };
  seats?: { active: number; limit: number | null };
}

function card(
  id: string,
  label: string,
  value: string | number,
  variation: string,
  hint: string,
  icon: DashboardIcon,
): DashboardCard {
  return { id, label, value, variation, hint, icon };
}

function unavailableHero(surface: DashboardSurface): DashboardCard {
  const definitions: Record<DashboardSurface, Pick<DashboardCard, "id" | "label">> = {
    agent: { id: "queue", label: "Na fila agora" },
    manager: { id: "pipeline", label: "Valor do pipeline" },
    admin: { id: "instances", label: "Instâncias online" },
  };
  const definition = definitions[surface];
  return card(
    definition.id,
    definition.label,
    "—",
    "",
    "Dados indisponíveis no momento.",
    "warning",
  );
}

function formatDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function formatCurrency(locale: string | undefined, currency: string, cents: number): string {
  return new Intl.NumberFormat(locale === "es" ? "es-ES" : "pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function singleCurrency(
  values: Record<string, number>,
): { currency: string; value: number } | "empty" | "multiple" {
  const entries = Object.entries(values);
  if (entries.length === 0) return "empty";
  if (entries.length > 1) return "multiple";
  const [currency, value] = entries[0] ?? [];
  return typeof currency === "string" && typeof value === "number" ? { currency, value } : "empty";
}

function pushFirstResponse(
  cards: DashboardCard[],
  omitted: DashboardOmission[],
  attendants: DashboardSources["attendants"],
  hint = "Tempo médio até a primeira resposta humana.",
) {
  if (!attendants || attendants.first_response_seconds === null) {
    omitted.push({ id: "first_response", reason: "source_unavailable" });
    return;
  }
  cards.push(
    card(
      "first_response",
      "Primeira resposta",
      formatDuration(attendants.first_response_seconds),
      "No período",
      hint,
      "timer",
    ),
  );
}

function buildAgentSummary(sources: DashboardSources): DashboardSummary {
  const omitted: DashboardOmission[] = [];
  const cards: DashboardCard[] = [];
  const queue = sources.conversation_counts?.fila ?? sources.conversation_counts?.unassigned;
  const hero =
    typeof queue === "number"
      ? card(
          "queue",
          "Na fila agora",
          queue,
          "Agora",
          "Conversas aguardando atendimento.",
          "chat",
        )
      : unavailableHero("agent");
  if (typeof queue !== "number") omitted.push({ id: "queue", reason: "source_unavailable" });

  pushFirstResponse(cards, omitted, sources.attendants);

  if (sources.conversation_counts) {
    cards.push(
      card(
        "assigned_conversations",
        "Conversas atribuídas",
        sources.conversation_counts.mine,
        "Em aberto",
        "Conversas abertas atribuídas a você.",
        "chat",
      ),
    );
  } else {
    omitted.push({ id: "assigned_conversations", reason: "source_unavailable" });
  }

  if (sources.open_tasks) {
    cards.push(
      card(
        "overdue_tasks",
        "Tarefas atrasadas",
        sources.open_tasks.overdue,
        "Em aberto",
        "Tarefas abertas com prazo vencido.",
        "warning",
      ),
    );
  } else {
    omitted.push({ id: "overdue_tasks", reason: "source_unavailable" });
  }

  return { role_surface: "agent", hero, cards, omitted };
}

function buildManagerSummary(sources: DashboardSources): DashboardSummary {
  const omitted: DashboardOmission[] = [];
  const cards: DashboardCard[] = [];
  const open = sources.pipeline_open && singleCurrency(sources.pipeline_open.value_by_currency);
  const won = sources.won_revenue && singleCurrency(sources.won_revenue.value_by_currency);
  const wonCount = sources.won_revenue && singleCurrency(sources.won_revenue.count_by_currency);
  const hasOpen = typeof open === "object";
  const hasWon = typeof won === "object";
  const hasWonCount = typeof wonCount === "object";
  const hero = hasOpen
    ? card(
        "pipeline",
        "Valor do pipeline",
        formatCurrency(sources.locale, open.currency, open.value),
        "Agora",
        "Valor informado das oportunidades abertas.",
        "trend",
      )
    : unavailableHero("manager");

  if (!hasOpen) {
    omitted.push({
      id: "pipeline",
      reason: open === "multiple" ? "multiple_currencies" : "source_unavailable",
    });
  }

  if (hasWon) {
    cards.push(
      card(
        "won_revenue",
        "Receita ganha",
        formatCurrency(sources.locale, won.currency, won.value),
        "Mês atual",
        "Valor informado dos negócios ganhos fechados neste mês.",
        "money",
      ),
    );
  } else {
    omitted.push({
      id: "won_revenue",
      reason: won === "multiple" ? "multiple_currencies" : "source_unavailable",
    });
  }

  if (hasWon && hasWonCount && won.currency === wonCount.currency && wonCount.value > 0) {
    cards.push(
      card(
        "average_ticket",
        "Ticket médio",
        formatCurrency(sources.locale, won.currency, Math.round(won.value / wonCount.value)),
        "Mês atual",
        "Valor informado ganho dividido pelos negócios ganhos com valor informado.",
        "receipt",
      ),
    );
  } else {
    omitted.push({
      id: "average_ticket",
      reason:
        won === "multiple" ||
        wonCount === "multiple" ||
        (hasWon && hasWonCount && won.currency !== wonCount.currency)
          ? "multiple_currencies"
          : "source_unavailable",
    });
  }

  pushFirstResponse(
    cards,
    omitted,
    sources.attendants,
    "Média simples das primeiras respostas dos atendentes.",
  );
  if (sources.attendants && sources.attendants.attendant_count > 0) {
    cards.push(
      card(
        "conversations_per_attendant",
        "Conversas por atendente",
        (sources.attendants.conversations_handled / sources.attendants.attendant_count).toFixed(1),
        "No período",
        "Média entre atendentes que receberam conversas no período.",
        "users",
      ),
    );
  } else {
    omitted.push({ id: "conversations_per_attendant", reason: "source_unavailable" });
  }

  return { role_surface: "manager", hero, cards, omitted };
}

function buildAdminSummary(sources: DashboardSources): DashboardSummary {
  const omitted: DashboardOmission[] = [];
  const cards: DashboardCard[] = [];
  const hero = sources.channels
    ? card(
        "instances",
        "Instâncias online",
        `${sources.channels.online}/${sources.channels.total}`,
        "Agora",
        "Instâncias de canal em funcionamento.",
        "whatsapp",
      )
    : unavailableHero("admin");

  if (!sources.channels) omitted.push({ id: "instances", reason: "source_unavailable" });

  if (sources.seats?.limit != null) {
    cards.push(
      card(
        "active_seats",
        "Assentos ativos",
        `${sources.seats.active}/${sources.seats.limit}`,
        "Agora",
        "Membros ativos em relação ao limite configurado.",
        "seat",
      ),
    );
  } else {
    omitted.push({ id: "active_seats", reason: "limit_unavailable" });
  }

  pushFirstResponse(cards, omitted, sources.attendants);
  return { role_surface: "admin", hero, cards, omitted };
}

export function buildRoleSummary(
  surface: DashboardSurface,
  sources: DashboardSources,
): DashboardSummary {
  if (surface === "agent") return buildAgentSummary(sources);
  if (surface === "manager") return buildManagerSummary(sources);
  return buildAdminSummary(sources);
}
