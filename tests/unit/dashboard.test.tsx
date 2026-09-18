import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Dashboard } from "@/components/dashboard/Dashboard";
import type { Role } from "@/lib/auth/types";

const auth = {
  user: { id: "user-1", is_platform_admin: false },
  activeOrg: { orgId: "org-1", name: "Empresa teste", role: "manager" as Role },
};
vi.mock("@/hooks/auth/AuthProvider", () => ({ useAuth: () => auth }));

let failSummary = false;
let failPreferences = false;
let failPreferenceSave = false;
let taskDone = false;
let requests: string[] = [];
let savedPreferenceBody: unknown = null;
let summarySurface: "agent" | "manager" | "admin" = "manager";
let summaryHeroUnavailable = false;
let summaryHeroValue: string | number | undefined;

const heroBySurface = {
  agent: {
    id: "queue",
    label: "Fila de atendimento",
    value: 731,
    variation: "Agora",
    hint: "Conversas aguardando atendimento.",
    icon: "chat",
  },
  manager: {
    id: "pipeline",
    label: "Pipeline aberto",
    value: "R$ 12.345",
    variation: "Agora",
    hint: "Valor informado das oportunidades abertas.",
    icon: "trend",
  },
  admin: {
    id: "instances",
    label: "Instâncias online",
    value: "2/3",
    variation: "Agora",
    hint: "Instâncias de canal em funcionamento.",
    icon: "whatsapp",
  },
} as const;

function metricsFixture() {
  return {
    window: { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" },
    owner_user_id: null,
    funnel: [
      { stage_id: "proposal", stage_name: "Proposta", position: 1, count: 6 },
      { stage_id: "negotiation", stage_name: "Negociação", position: 2, count: 2 },
    ],
    attendants: [
      {
        user_id: "user-1",
        won: 3,
        lost: 1,
        conversations_handled: 7,
        avg_first_response_seconds: 120,
        name: "Pessoa teste",
        email: null,
      },
    ],
  };
}
function agentsFixture() {
  return [
    {
      id: "agent-1",
      organization_id: "org-1",
      name: "Agente teste",
      description: "Qualifica oportunidades",
      model: "test-model",
      system_prompt: "",
      is_active: true,
      is_default: false,
      config: {},
      guardrails: null,
      active_kb_version_id: null,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "agent-disabled",
      organization_id: "org-1",
      name: "Agente desativado",
      description: null,
      model: "test-model",
      system_prompt: "",
      is_active: false,
      is_default: false,
      config: {},
      guardrails: null,
      active_kb_version_id: null,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
    },
  ];
}
let metrics = metricsFixture();
let agents = agentsFixture();
const task = {
  id: "task-1",
  organization_id: "org-1",
  title: "Revisar proposta",
  description: null,
  due_date: null,
  status: "pending",
  priority: "medium",
  lead_id: null,
  contact_id: null,
  assigned_to: null,
  created_by: "user-1",
  created_at: "2026-09-01T12:00:00Z",
  updated_at: "2026-09-01T12:00:00Z",
};

beforeEach(() => {
  auth.user.is_platform_admin = false;
  auth.activeOrg.role = "manager";
  failSummary = false;
  failPreferences = false;
  failPreferenceSave = false;
  taskDone = false;
  requests = [];
  savedPreferenceBody = null;
  summarySurface = "manager";
  summaryHeroUnavailable = false;
  summaryHeroValue = undefined;
  metrics = metricsFixture();
  agents = agentsFixture();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input);
      requests.push(`${init?.method ?? "GET"} ${url}`);
      if (url.includes("/dashboard/summary")) {
        if (failSummary)
          return new Response(JSON.stringify({ error: { code: "internal_error" } }), {
            status: 500,
          });
        const baseHero = heroBySurface[summarySurface];
        const hero = summaryHeroValue === undefined ? baseHero : { ...baseHero, value: summaryHeroValue };
        return Response.json({
          data: {
            role_surface: summarySurface,
            hero: summaryHeroUnavailable ? { ...hero, value: "—" } : hero,
            cards:
              summarySurface === "manager"
                ? [
                    {
                      id: "pipeline_value",
                      label: "Pipeline aberto",
                      value: "R$ 12.345",
                      variation: "Agora",
                      hint: "Valor informado das oportunidades abertas.",
                      icon: "money",
                    },
                    {
                      id: "conversations_per_attendant",
                      label: "Conversas por atendente",
                      value: 731,
                      variation: "No período",
                      hint: "Média entre atendentes que receberam conversas no período.",
                      icon: "users",
                    },
                    {
                      id: "first_response",
                      label: "Primeira resposta",
                      value: "4m 17s",
                      variation: "No período",
                      hint: "Tempo médio até a primeira resposta humana.",
                      icon: "timer",
                    },
                  ]
                : [],
            omitted: [],
          },
        });
      }
      if (url.includes("/conversations?"))
        return Response.json({
          data: [
            {
              id: "conv-1",
              contacts: { display_name: "Contato teste", name: null },
              last_message_preview: "Quero uma proposta",
              last_message_at: "2026-09-01T12:00:00Z",
            },
          ],
        });
      if (url.includes("/ai/automatico-ativo"))
        return Response.json({
          data: {
            ativo: true,
            estado: "em_teste",
            motivo: null,
            numeros_autorizados: 1,
            canal_id: "channel-1",
          },
        });
      if (url.includes("/metrics/attendants"))
        return Response.json({ data: metrics });
      if (url.includes("/ai/agents"))
        return Response.json({ data: agents });
      if (url.includes("/tasks/task-1")) {
        taskDone = true;
        return Response.json({ data: { task: { ...task, status: "done" } } });
      }
      if (url.includes("/dashboard/preferences")) {
        if (failPreferences && (init?.method ?? "GET") === "GET")
          return new Response(JSON.stringify({ error: { code: "internal_error" } }), {
            status: 500,
          });
        if (failPreferenceSave && init?.method === "PUT")
          return new Response(JSON.stringify({ error: { code: "internal_error" } }), {
            status: 500,
          });
        if (init?.method === "PUT") savedPreferenceBody = JSON.parse(String(init.body));
        return Response.json({ data: { layout: null, source: "default" } });
      }
      if (url.includes("/tasks")) return Response.json({ data: { tasks: taskDone ? [] : [task] } });
      throw new Error(`Requisição inesperada no teste: ${url}`);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mount() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <Dashboard />
    </QueryClientProvider>,
  );
  return qc;
}

describe("Dashboard operacional", () => {
  it("renderiza somente as sentinelas da API, sem métricas de demonstração", async () => {
    mount();

    const summary = await screen.findByRole("region", { name: "Resumo operacional" });
    const renderedValues = Array.from(
      summary.querySelectorAll<HTMLElement>("[data-testid^='dashboard-value-']"),
      (element) => element.textContent,
    );
    expect(new Set(renderedValues)).toEqual(new Set(["731", "R$ 12.345", "4m 17s"]));
    expect(
      renderedValues.every((value) => ["731", "R$ 12.345", "4m 17s"].includes(value ?? "")),
    ).toBe(true);
    expect(renderedValues).not.toContain("0");
    expect(renderedValues).not.toContain("R$ 8.941");
    expect(await screen.findByRole("link", { name: /Contato teste/ })).toHaveAttribute(
      "href",
      "/app/inbox?id=conv-1",
    );
  });

  it.each([
    ["agent", 947, "947 conversas esperando resposta", "Abrir a fila", "/app/inbox"],
    ["manager", "R$ 98.765", "Pipeline de R$ 98.765 em jogo", "Revisar funil", "/app/kanban"],
    ["admin", "4/9", "4 de 9 instâncias conectadas", "Ver instâncias", "/app/connections"],
  ] as const)("usa título e CTA exatos para %s", async (surface, value, title, cta, href) => {
    summarySurface = surface;
    summaryHeroValue = value;
    mount();
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeVisible();
    expect(screen.getByRole("link", { name: cta })).toHaveAttribute("href", href);
  });

  it("omite a cifra do título quando o hero está indisponível", async () => {
    summaryHeroUnavailable = true;
    mount();

    expect(await screen.findByRole("heading", { level: 1, name: "Pipeline em jogo" })).toBeVisible();
    expect(screen.queryByRole("heading", { level: 1, name: /—|\d/ })).not.toBeInTheDocument();
  });

  it("restaura os widgets com funil, conversão e agentes das APIs canônicas", async () => {
    mount();

    expect(await screen.findByText("Proposta")).toBeVisible();
    expect(screen.getByText("8")).toBeVisible();
    expect(screen.getByText("75%")).toBeVisible();
    expect(screen.getByText("Agente teste")).toBeVisible();
    expect(screen.queryByText("Agente desativado")).not.toBeInTheDocument();
    expect(requests.some((request) => request.includes("/metrics/attendants"))).toBe(true);
    expect(requests.some((request) => request.includes("/ai/agents"))).toBe(true);
  });

  it("não consulta nem oferece retry do resumo para viewer", async () => {
    auth.activeOrg.role = "viewer";
    failSummary = true;
    mount();

    await screen.findByRole("link", { name: /Contato teste/ });
    expect(requests.some((request) => request.includes("/dashboard/summary"))).toBe(false);
    expect(screen.queryByRole("region", { name: "Resumo operacional" })).not.toBeInTheDocument();
    expect(screen.queryByText("Não foi possível carregar as métricas do painel.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).not.toBeInTheDocument();
    expect(requests.some((request) => request.includes("/metrics/attendants"))).toBe(false);
    expect(requests.some((request) => request.includes("/ai/agents"))).toBe(false);
    expect(screen.getByRole("link", { name: /Contato teste/ })).toBeVisible();
    expect(screen.getByText("Revisar proposta")).toBeVisible();
    expect(
      screen.getByText("Abra a fila para acompanhar conversas aguardando atendimento."),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Personalizar painel" }));
    const dialog = screen.getByRole("dialog", { name: "Personalizar painel" });
    expect(within(dialog).queryByTestId("dashboard-editor-conversation_summary")).not.toBeInTheDocument();
    expect(within(dialog).getByTestId("dashboard-editor-recent_conversations")).toBeVisible();
    expect(within(dialog).getByTestId("dashboard-editor-upcoming_work")).toBeVisible();
  });

  it("mantém resumo administrativo sem chamar APIs do papel viewer", async () => {
    auth.user.is_platform_admin = true;
    auth.activeOrg.role = "viewer";
    summarySurface = "admin";
    mount();

    expect(await screen.findByRole("region", { name: "Resumo operacional" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Ver instâncias" })).toHaveAttribute(
      "href",
      "/app/connections",
    );
    expect(requests.some((request) => request.includes("/dashboard/summary"))).toBe(true);
    expect(requests.some((request) => request.includes("/metrics/attendants"))).toBe(false);
    expect(requests.some((request) => request.includes("/ai/agents"))).toBe(false);
    expect(screen.getByRole("button", { name: "Liberar para todos" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Autorizar números" })).toHaveAttribute(
      "href",
      "/app/connections",
    );
    await userEvent.click(screen.getByRole("button", { name: "Personalizar painel" }));
    const dialog = screen.getByRole("dialog", { name: "Personalizar painel" });
    expect(within(dialog).queryByTestId("dashboard-editor-conversation_summary")).not.toBeInTheDocument();
    expect(within(dialog).queryByTestId("dashboard-editor-opportunities_by_stage")).not.toBeInTheDocument();
    expect(within(dialog).queryByTestId("dashboard-editor-active_agents")).not.toBeInTheDocument();
  });

  it("informa corretamente quando há somente agentes desativados", async () => {
    agents = agents.filter((agent) => !agent.is_active);
    mount();

    expect(await screen.findByText("Nenhum agente ativo.")).toBeVisible();
    expect(screen.queryByText("Agente desativado")).not.toBeInTheDocument();
  });

  it("não inventa conversão quando não há decisões", async () => {
    metrics.attendants = [];
    mount();
    expect(await screen.findByText("—")).toBeVisible();
  });

  it("não trata atendentes com 0/0 como conversão zero", async () => {
    metrics.attendants = [
      {
        user_id: "user-1",
        won: 0,
        lost: 0,
        conversations_handled: 0,
        avg_first_response_seconds: 0,
        name: "Pessoa teste",
        email: null,
      },
    ];
    mount();
    expect(await screen.findByText("—")).toBeVisible();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("restaura o editor, redimensiona e salva a preferência do painel", async () => {
    mount();
    await screen.findByRole("region", { name: "Resumo operacional" });
    await userEvent.click(screen.getByRole("button", { name: "Personalizar painel" }));
    const dialog = screen.getByRole("dialog", { name: "Personalizar painel" });
    expect(within(dialog).getByTestId("dashboard-editor-service_queue")).toBeVisible();
    fireEvent.change(
      within(dialog).getByRole("slider", { name: "Redimensionar Fila de atendimento" }),
      { target: { value: "0" } },
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar painel" }));
    await waitFor(() => expect(savedPreferenceBody).not.toBeNull());
    expect(
      (savedPreferenceBody as { widgets: Array<{ id: string; size: string }> }).widgets.find(
        (widget) => widget.id === "service_queue",
      )?.size,
    ).toBe("medium");
  });

  it("reordena blocos por arrastar antes de salvar", async () => {
    mount();
    await screen.findByRole("region", { name: "Resumo operacional" });
    await userEvent.click(screen.getByRole("button", { name: "Personalizar painel" }));
    const dialog = screen.getByRole("dialog", { name: "Personalizar painel" });
    const source = within(dialog).getByTestId("dashboard-editor-recent_conversations");
    const target = within(dialog).getByTestId("dashboard-editor-service_queue");
    fireEvent.dragStart(source);
    fireEvent.dragOver(target);
    fireEvent.drop(target);
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar painel" }));
    await waitFor(() => expect(savedPreferenceBody).not.toBeNull());
    const ids = (savedPreferenceBody as { widgets: Array<{ id: string }> }).widgets.map(
      (widget) => widget.id,
    );
    expect(ids.indexOf("recent_conversations")).toBeLessThan(ids.indexOf("service_queue"));
  });

  it("mantém o padrão visível e informa quando a preferência não carrega", async () => {
    failPreferences = true;
    mount();
    expect(await screen.findByRole("region", { name: "Resumo operacional" })).toBeVisible();
    expect(screen.getByText("Não foi possível carregar sua personalização.")).toBeVisible();
  });

  it("mantém o editor aberto quando salvar a personalização falha", async () => {
    failPreferenceSave = true;
    mount();
    await screen.findByRole("region", { name: "Resumo operacional" });
    await userEvent.click(screen.getByRole("button", { name: "Personalizar painel" }));
    const dialog = screen.getByRole("dialog", { name: "Personalizar painel" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar painel" }));
    expect(await within(dialog).findByText("Não foi possível salvar o painel.")).toBeVisible();
    expect(dialog).toBeVisible();
  });

  it("não transforma falha do resumo em zero e permite tentar de novo", async () => {
    failSummary = true;
    mount();

    expect(
      await screen.findByText("Não foi possível carregar as métricas do painel."),
    ).toBeVisible();
    expect(screen.queryByText("731")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(
      requests.filter((request) => request.includes("/dashboard/summary")).length,
    ).toBeGreaterThan(1);
  });

  it("preserva a conclusão de tarefa e invalida a lista canônica", async () => {
    const qc = mount();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Concluir Revisar proposta" }),
    );
    await waitFor(() => expect(screen.queryByText("Revisar proposta")).not.toBeInTheDocument());
    expect(requests).toContain("PATCH /api/v1/tasks/task-1");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["crm_tasks"] });
  });
});
