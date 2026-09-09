import { describe, expect, it } from "vitest";

import {
  DASHBOARD_SCHEMA_VERSION,
  DEFAULT_DASHBOARD_LAYOUT,
  WIDGET_CATALOG,
  dashboardLayoutSchema,
  moveDashboardWidget,
  reorderDashboardWidget,
  resizeDashboardWidget,
  sanitizeDashboardLayout,
} from "./preferences";

describe("preferências do dashboard", () => {
  it("mantém um catálogo estável com oito widgets", () => {
    expect(Object.keys(WIDGET_CATALOG)).toEqual([
      "conversation_summary",
      "service_queue",
      "opportunities_by_stage",
      "period_conversion",
      "upcoming_work",
      "recent_conversations",
      "active_agents",
      "at_risk_clients",
    ]);
    expect(DEFAULT_DASHBOARD_LAYOUT.schema_version).toBe(DASHBOARD_SCHEMA_VERSION);
  });

  it("aceita somente ids, visibilidade e tamanhos conhecidos", () => {
    expect(
      dashboardLayoutSchema.safeParse({
        schema_version: 1,
        widgets: [{ id: "service_queue", size: "wide", visible: true }],
      }).success,
    ).toBe(true);
    expect(
      dashboardLayoutSchema.safeParse({
        schema_version: 1,
        widgets: [{ id: "service_queue", size: "gigante", visible: true }],
      }).success,
    ).toBe(false);
  });

  it("remove widgets desconhecidos, duplicados e acima do papel", () => {
    const sanitized = sanitizeDashboardLayout(
      {
        schema_version: 1,
        widgets: [
          { id: "recent_conversations", size: "wide", visible: true },
          { id: "active_agents", size: "medium", visible: true },
          { id: "recent_conversations", size: "small", visible: false },
          { id: "inventado", size: "small", visible: true },
        ],
      },
      "agent",
    );

    expect(sanitized.widgets.map((widget) => widget.id)).not.toContain("inventado");
    expect(sanitized.widgets.filter((widget) => widget.id === "recent_conversations")).toHaveLength(1);
    expect(sanitized.widgets.map((widget) => widget.id)).not.toContain("active_agents");
  });

  it("corrige tamanho não permitido sem perder a ordem válida", () => {
    const sanitized = sanitizeDashboardLayout(
      {
        schema_version: 1,
        widgets: [
          { id: "service_queue", size: "full", visible: true },
          { id: "conversation_summary", size: "small", visible: true },
        ],
      },
      "manager",
    );

    expect(sanitized.widgets[0]).toMatchObject({ id: "service_queue", size: "wide" });
    expect(sanitized.widgets[1]).toMatchObject({ id: "conversation_summary", size: "full" });
  });

  it("degrada layout inválido ou de versão futura para o default permitido", () => {
    expect(sanitizeDashboardLayout({ schema_version: 99, widgets: [] }, "viewer")).toEqual(
      sanitizeDashboardLayout(DEFAULT_DASHBOARD_LAYOUT, "viewer"),
    );
    expect(sanitizeDashboardLayout({ qualquer: "coisa" }, "manager")).toEqual(
      sanitizeDashboardLayout(DEFAULT_DASHBOARD_LAYOUT, "manager"),
    );
  });

  it("move um widget sem perder visibilidade ou tamanho", () => {
    const before = DEFAULT_DASHBOARD_LAYOUT.widgets.findIndex(
      (widget) => widget.id === "recent_conversations",
    );
    const moved = moveDashboardWidget(
      DEFAULT_DASHBOARD_LAYOUT,
      "recent_conversations",
      "up",
    );
    const after = moved.widgets.findIndex((widget) => widget.id === "recent_conversations");

    expect(after).toBe(before - 1);
    expect(moved.widgets[after]).toEqual(DEFAULT_DASHBOARD_LAYOUT.widgets[before]);
  });

  it("reordena um widget arrastado até outro sem alterar o restante", () => {
    const moved = reorderDashboardWidget(
      DEFAULT_DASHBOARD_LAYOUT,
      "recent_conversations",
      "service_queue",
    );
    expect(moved.widgets.map((widget) => widget.id).slice(0, 3)).toEqual([
      "conversation_summary",
      "recent_conversations",
      "service_queue",
    ]);
    expect(moved.widgets.find((widget) => widget.id === "recent_conversations")?.size).toBe(
      "wide",
    );
  });

  it("redimensiona somente entre tamanhos aceitos pelo catálogo", () => {
    expect(resizeDashboardWidget(DEFAULT_DASHBOARD_LAYOUT, "service_queue", 0).widgets[1]).toMatchObject({
      id: "service_queue",
      size: "medium",
    });
    expect(resizeDashboardWidget(DEFAULT_DASHBOARD_LAYOUT, "service_queue", 99).widgets[1]).toMatchObject({
      id: "service_queue",
      size: "wide",
    });
  });
});
