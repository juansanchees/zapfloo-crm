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
  pipeline?: {
    open_value_by_currency: Record<string, number>;
    won_value_by_currency: Record<string, number>;
    won_count_by_currency: Record<string, number>;
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
  const labels: Record<DashboardSurface, string> = {
    agent: "Fila de atendimento",
    manager: "Pipeline aberto",
    admin: "Instâncias online",
  };
  return card("hero", labels[surface], "—", "", "Dados indisponíveis no momento.", "warning");
}

function formatDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function formatCurrency(currency: string, cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function singleCurrency(
  values: Record<string, number>,
): { currency: string; value: number } | null {
  const entries = Object.entries(values);
  if (entries.length !== 1) return null;
  const [currency, value] = entries[0] ?? [];
  return typeof currency === "string" && typeof value === "number" ? { currency, value } : null;
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
          "Fila de atendimento",
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
  const open = sources.pipeline && singleCurrency(sources.pipeline.open_value_by_currency);
  const won = sources.pipeline && singleCurrency(sources.pipeline.won_value_by_currency);
  const wonCount = sources.pipeline && singleCurrency(sources.pipeline.won_count_by_currency);
  const hero = open
    ? card(
        "pipeline",
        "Pipeline aberto",
        formatCurrency(open.currency, open.value),
        "Agora",
        "Valor das oportunidades abertas.",
        "trend",
      )
    : unavailableHero("manager");

  if (!sources.pipeline) {
    omitted.push(
      { id: "pipeline_value", reason: "source_unavailable" },
      { id: "won_revenue", reason: "source_unavailable" },
      { id: "average_ticket", reason: "source_unavailable" },
    );
  } else {
    if (open) {
      cards.push(
        card(
          "pipeline_value",
          "Pipeline aberto",
          formatCurrency(open.currency, open.value),
          "Agora",
          "Valor das oportunidades abertas.",
          "trend",
        ),
      );
    } else {
      omitted.push({ id: "pipeline_value", reason: "multiple_currencies" });
    }

    if (won) {
      cards.push(
        card(
          "won_revenue",
          "Receita ganha",
          formatCurrency(won.currency, won.value),
          "Mês atual",
          "Negócios ganhos fechados neste mês.",
          "money",
        ),
      );
    } else {
      omitted.push({ id: "won_revenue", reason: "multiple_currencies" });
    }

    if (won && wonCount && won.currency === wonCount.currency && wonCount.value > 0) {
      cards.push(
        card(
          "average_ticket",
          "Ticket médio",
          formatCurrency(won.currency, Math.round(won.value / wonCount.value)),
          "Mês atual",
          "Receita ganha dividida pelos negócios ganhos.",
          "receipt",
        ),
      );
    } else {
      omitted.push({
        id: "average_ticket",
        reason:
          won && wonCount && won.currency !== wonCount.currency
            ? "multiple_currencies"
            : "source_unavailable",
      });
    }
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
        "Média de conversas atribuídas por atendente.",
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

  if (sources.channels) {
    cards.push(
      card(
        "online_instances",
        "Instâncias online",
        `${sources.channels.online}/${sources.channels.total}`,
        "Agora",
        "Instâncias de canal em funcionamento.",
        "whatsapp",
      ),
    );
  } else {
    omitted.push({ id: "online_instances", reason: "source_unavailable" });
  }

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
