import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
let taskDone = false;
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
  failSummary = false;
  taskDone = false;
  requests = [];
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
        return Response.json({
          data: {
            role_surface: "manager",
            hero: {
              id: "pipeline",
              label: "Pipeline aberto",
              value: 731,
              variation: "Agora",
              hint: "Valor das oportunidades abertas.",
              icon: "trend",
            },
            cards: [
              {
                id: "pipeline_value",
                label: "Pipeline aberto",
                value: "R$ 12.345",
                variation: "Agora",
                hint: "Valor das oportunidades abertas.",
                icon: "money",
              },
              {
                id: "first_response",
                label: "Primeira resposta",
                value: "4m 17s",
                variation: "No período",
                hint: "Tempo médio até a primeira resposta humana.",
                icon: "timer",
              },
            ],
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
      if (url.includes("/tasks/task-1")) {
        taskDone = true;
        return Response.json({ data: { task: { ...task, status: "done" } } });
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

    expect(await screen.findByText("731")).toBeVisible();
    expect(screen.getByText("R$ 12.345")).toBeVisible();
    expect(screen.getByText("4m 17s")).toBeVisible();
    expect(screen.queryByText("R$ 8.940")).not.toBeInTheDocument();
    expect(screen.queryByText("94%")).not.toBeInTheDocument();
    expect(screen.queryByText("68%")).not.toBeInTheDocument();
    expect(screen.queryByText("128.400")).not.toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Contato teste/ })).toHaveAttribute(
      "href",
      "/app/inbox?id=conv-1",
    );
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
