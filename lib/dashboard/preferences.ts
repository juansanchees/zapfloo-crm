import { z } from "zod";

import { ROLE_RANK, type Role } from "@/lib/auth/types";

export const DASHBOARD_SCHEMA_VERSION = 1 as const;

export const dashboardWidgetSizeSchema = z.enum(["small", "medium", "wide", "full"]);
export type DashboardWidgetSize = z.infer<typeof dashboardWidgetSizeSchema>;

export const dashboardWidgetPreferenceSchema = z.object({
  id: z.string().min(1).max(80),
  size: dashboardWidgetSizeSchema,
  visible: z.boolean(),
});

export const dashboardLayoutSchema = z.object({
  schema_version: z.literal(DASHBOARD_SCHEMA_VERSION),
  widgets: z.array(dashboardWidgetPreferenceSchema).max(32),
});

export type DashboardLayout = z.infer<typeof dashboardLayoutSchema>;
export type DashboardWidgetId = keyof typeof WIDGET_CATALOG;

interface DashboardWidgetDefinition {
  label: string;
  description: string;
  minRole: Role;
  defaultSize: DashboardWidgetSize;
  allowedSizes: readonly DashboardWidgetSize[];
  periodAware: boolean;
}

/**
 * Catálogo fechado: preferência salva escolhe apresentação, nunca consulta.
 * A ordem deste objeto é contrato do layout padrão e dos controles de edição.
 */
export const WIDGET_CATALOG = {
  conversation_summary: {
    label: "Resumo de conversas",
    description: "Volume registrado, fila e conversas atribuídas.",
    minRole: "viewer",
    defaultSize: "full",
    allowedSizes: ["wide", "full"],
    periodAware: false,
  },
  service_queue: {
    label: "Fila de atendimento",
    description: "Conversas esperando pelo próximo atendimento.",
    minRole: "viewer",
    defaultSize: "wide",
    allowedSizes: ["medium", "wide"],
    periodAware: false,
  },
  opportunities_by_stage: {
    label: "Oportunidades por etapa",
    description: "Distribuição atual das oportunidades no funil.",
    minRole: "agent",
    defaultSize: "wide",
    allowedSizes: ["medium", "wide", "full"],
    periodAware: true,
  },
  period_conversion: {
    label: "Conversão do período",
    description: "Proporção de oportunidades ganhas no intervalo.",
    minRole: "agent",
    defaultSize: "medium",
    allowedSizes: ["small", "medium"],
    periodAware: true,
  },
  upcoming_work: {
    label: "Próximos compromissos",
    description: "Tarefas e compromissos que pedem ação.",
    minRole: "viewer",
    defaultSize: "medium",
    allowedSizes: ["medium", "wide"],
    periodAware: false,
  },
  recent_conversations: {
    label: "Conversas recentes",
    description: "Atalhos para os atendimentos mais recentes.",
    minRole: "viewer",
    defaultSize: "wide",
    allowedSizes: ["medium", "wide", "full"],
    periodAware: false,
  },
  active_agents: {
    label: "Agentes ativos",
    description: "Agentes de IA disponíveis na organização.",
    minRole: "manager",
    defaultSize: "medium",
    allowedSizes: ["small", "medium"],
    periodAware: false,
  },
  at_risk_clients: {
    label: "Clientes que precisam de atenção",
    description: "Atendimentos e oportunidades com risco de esfriar.",
    minRole: "agent",
    defaultSize: "medium",
    allowedSizes: ["medium", "wide"],
    periodAware: true,
  },
} as const satisfies Record<string, DashboardWidgetDefinition>;

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = {
  schema_version: DASHBOARD_SCHEMA_VERSION,
  widgets: Object.entries(WIDGET_CATALOG).map(([id, definition]) => ({
    id,
    size: definition.defaultSize,
    visible: true,
  })),
};

function canSeeWidget(definition: DashboardWidgetDefinition, role: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[definition.minRole];
}

function defaultForRole(role: Role): DashboardLayout {
  return {
    schema_version: DASHBOARD_SCHEMA_VERSION,
    widgets: DEFAULT_DASHBOARD_LAYOUT.widgets.filter((widget) =>
      canSeeWidget(WIDGET_CATALOG[widget.id as DashboardWidgetId], role),
    ),
  };
}

/**
 * Trata JSON persistido como entrada hostil e evolutiva. Nunca lança: dashboard
 * padrão é parte do caminho de recuperação, não uma segunda tela de erro.
 */
export function sanitizeDashboardLayout(raw: unknown, role: Role): DashboardLayout {
  const parsed = dashboardLayoutSchema.safeParse(raw);
  if (!parsed.success) return defaultForRole(role);

  const seen = new Set<DashboardWidgetId>();
  const widgets: DashboardLayout["widgets"] = [];

  for (const candidate of parsed.data.widgets) {
    if (!(candidate.id in WIDGET_CATALOG)) continue;
    const id = candidate.id as DashboardWidgetId;
    if (seen.has(id)) continue;
    const definition = WIDGET_CATALOG[id];
    if (!canSeeWidget(definition, role)) continue;
    seen.add(id);
    widgets.push({
      id,
      size: (definition.allowedSizes as readonly DashboardWidgetSize[]).includes(candidate.size)
        ? candidate.size
        : definition.defaultSize,
      visible: candidate.visible,
    });
  }

  for (const [id, definition] of Object.entries(WIDGET_CATALOG) as Array<
    [DashboardWidgetId, DashboardWidgetDefinition]
  >) {
    if (seen.has(id) || !canSeeWidget(definition, role)) continue;
    widgets.push({ id, size: definition.defaultSize, visible: false });
  }

  return { schema_version: DASHBOARD_SCHEMA_VERSION, widgets };
}

export function moveDashboardWidget(
  layout: DashboardLayout,
  id: string,
  direction: "up" | "down",
): DashboardLayout {
  const index = layout.widgets.findIndex((widget) => widget.id === id);
  const destination = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || destination < 0 || destination >= layout.widgets.length) return layout;

  const widgets = [...layout.widgets];
  const current = widgets[index];
  const target = widgets[destination];
  if (!current || !target) return layout;
  widgets[index] = target;
  widgets[destination] = current;
  return { ...layout, widgets };
}
