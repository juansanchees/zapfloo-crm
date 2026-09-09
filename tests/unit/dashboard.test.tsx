import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Dashboard } from "@/components/dashboard/Dashboard";
import type { Role } from "@/lib/auth/types";

const auth = {
  user: { id: "user-1", is_platform_admin: false },
  activeOrg: { orgId: "org-1", name: "Empresa teste", role: "admin" as Role },
};
vi.mock("@/hooks/auth/AuthProvider", () => ({ useAuth: () => auth }));

let failCounts = false;
let failPatch = false;
let failPreferences = false;
let failPreferenceSave = false;
let taskDone = false;
let taskLimitReached = false;
let requests: string[] = [];
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
  auth.activeOrg.role = "admin";
  failCounts = false;
  failPatch = false;
  failPreferences = false;
  failPreferenceSave = false;
  taskDone = false;
  taskLimitReached = false;
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input);
      requests.push(`${init?.method ?? "GET"} ${url}`);
      if (url.includes("/tasks/task-1")) {
        if (failPatch)
          return new Response(
            JSON.stringify({
              error: { code: "validation_failed", message: "Não foi possível concluir." },
            }),
            { status: 422 },
          );
        taskDone = true;
        return Response.json({ data: { task: { ...task, status: "done" } } });
      }
      if (url.includes("conversations/counts")) {
        if (failCounts)
          return new Response(
            JSON.stringify({ error: { code: "internal_error", message: "Falha de leitura" } }),
            { status: 500 },
          );
        return Response.json({ data: { all: 17, mine: 4, fila: 2, unassigned: 2, automatico: 8 } });
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
      if (url.includes("/tasks"))
        return Response.json({
          data: {
            tasks: taskDone
              ? []
              : taskLimitReached
                ? Array.from({ length: 500 }, (_, i) => ({ ...task, id: `task-${i}` }))
                : [task],
          },
        });
      if (url.includes("/metrics/attendants"))
        return Response.json({
          data: {
            window: { from: "2026-08-10T12:00:00Z", to: "2026-09-09T12:00:00Z" },
            owner_user_id: null,
            funnel: [{ stage_id: "s1", stage_name: "Proposta", position: 1, count: 7 }],
            attendants: [
              {
                user_id: "user-1",
                won: 3,
                lost: 1,
                conversations_handled: 9,
                avg_first_response_seconds: 100,
                name: null,
                email: null,
              },
            ],
          },
        });
      if (url.includes("/ai/agents"))
        return Response.json({
          data: [
            {
              id: "a1",
              name: "Agente teste",
              description: "Suporte",
              is_active: true,
              published_version_id: "v1",
            },
          ],
        });
      if (url.includes("/dashboard/preferences")) {
        if (failPreferences && (init?.method ?? "GET") === "GET")
          return new Response(
            JSON.stringify({ error: { code: "internal_error", message: "Falha de leitura" } }),
            { status: 500 },
          );
        if (failPreferenceSave && init?.method === "PUT")
          return new Response(
            JSON.stringify({ error: { code: "internal_error", message: "Falha ao salvar" } }),
            { status: 500 },
          );
        return Response.json({ data: { layout: null, source: "default" } });
      }
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
  it("usa dados da API e abre a conversa real, sem métricas de demonstração", async () => {
    mount();
    expect(await screen.findByRole("link", { name: /Contato teste/ })).toHaveAttribute(
      "href",
      "/app/inbox?id=conv-1",
    );
    expect(await screen.findByText("17")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("R$ 8.940")).not.toBeInTheDocument();
    expect(screen.getAllByText(/30 dias/).length).toBeGreaterThan(0);
    expect(screen.getByText("Com responsável · últimos 30 dias")).toBeInTheDocument();
  });
  it("não transforma falha de contagem em uma fila vazia", async () => {
    failCounts = true;
    mount();
    expect(await screen.findByText("Não foi possível carregar as contagens.")).toBeInTheDocument();
    expect(screen.queryByText("Sua fila está em dia")).not.toBeInTheDocument();
  });
  it("viewer não consulta métricas ou agentes nem recebe ação de concluir tarefa", async () => {
    auth.activeOrg.role = "viewer";
    mount();
    await screen.findByText("Revisar proposta");
    expect(requests.some((r) => r.includes("/metrics/") || r.includes("/ai/agents"))).toBe(false);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Ver agentes/ })).not.toBeInTheDocument();
  });
  it("só remove tarefa depois de persistir e invalida a lista canônica", async () => {
    const qc = mount();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Concluir Revisar proposta" }),
    );
    await waitFor(() => expect(screen.queryByText("Revisar proposta")).not.toBeInTheDocument());
    expect(requests).toContain("PATCH /api/v1/tasks/task-1");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["crm_tasks"] });
  });
  it("não apresenta o limite da API como total exato de tarefas", async () => {
    auth.activeOrg.role = "viewer";
    taskLimitReached = true;
    mount();
    expect(await screen.findByText("500+")).toBeInTheDocument();
  });
  it("mantém a tarefa e avisa quando a conclusão é recusada", async () => {
    failPatch = true;
    mount();
    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Concluir Revisar proposta" }),
    );
    expect(
      await screen.findByText("Não foi possível concluir a tarefa. Tente novamente."),
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByText("Revisar proposta")).toBeInTheDocument();
  });
  it("oferece personalização do painel sem esconder os dados reais", async () => {
    mount();
    await screen.findByText("Contato teste");

    await userEvent.click(screen.getByRole("button", { name: "Personalizar painel" }));

    const dialog = screen.getByRole("dialog", { name: "Personalizar painel" });
    expect(dialog).toBeVisible();
    expect(within(dialog).getByText("Resumo de conversas")).toBeVisible();
    expect(within(dialog).getByText("Clientes que precisam de atenção")).toBeVisible();
  });
  it("mantém o padrão visível e informa quando a preferência não carrega", async () => {
    failPreferences = true;
    mount();
    expect(await screen.findByText("Contato teste")).toBeVisible();
    expect(screen.getByText("Não foi possível carregar sua personalização.")).toBeVisible();
  });
  it("mantém o personalizador aberto e informa quando salvar falha", async () => {
    failPreferenceSave = true;
    mount();
    await screen.findByText("Contato teste");
    await userEvent.click(screen.getByRole("button", { name: "Personalizar painel" }));
    const dialog = screen.getByRole("dialog", { name: "Personalizar painel" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Salvar painel" }));
    await waitFor(() => expect(requests).toContain("PUT /api/v1/dashboard/preferences"));
    expect(await within(dialog).findByText("Não foi possível salvar o painel.")).toBeVisible();
    expect(dialog).toBeVisible();
  });
});
