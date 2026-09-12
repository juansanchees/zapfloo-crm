import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

const acoes = vi.hoisted(() => ({ salvar: vi.fn(), publicar: vi.fn(), criar: vi.fn() }));
const api = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/app/ai/agents/novo",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
vi.mock("@/app/app/ai/agents/[id]/_actions", () => ({
  saveAgentDraftAction: acoes.salvar,
  publishAgentAction: acoes.publicar,
  createMcpAgentAction: acoes.criar,
}));
vi.mock("@/lib/api/client", () => ({ apiClient: api }));

import { AgentForm } from "@/app/app/ai/agents/[id]/_components/AgentForm";

const CANAL = "22222222-2222-4222-8222-222222222222";
const CREDENCIAL = "11111111-1111-4111-8111-111111111111";

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

function abrirNovo() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AgentForm
        mode="create"
        credentials={[
          {
            id: CREDENCIAL,
            provider: "openai",
            label: "Chave validada",
            is_active: true,
            validated_at: "2026-09-12T00:00:00Z",
          } as never,
        ]}
        channelSessions={[
          {
            id: CANAL,
            display_name: "Recepção",
            status: "WORKING",
            phone_number: null,
            ai_access_mode: "open",
            ai_test_phone_count: 0,
          },
        ]}
        initialSetup={{
          provider: "openai",
          model: "gpt-5.6-luna",
          credential_id: CREDENCIAL,
          tool_ids: ["crm_find_free_slots"],
          organization_timezone: "America/Recife",
        }}
      />
    </QueryClientProvider>,
  );
}

function abrirEdicao(
  opcoes: { usaChaveDaInstalacao?: boolean; instalacaoTemChave?: boolean } = {},
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const version = {
    id: "version-1",
    organization_id: "org-1",
    agent_id: "agent-1",
    version_number: 1,
    status: opcoes.usaChaveDaInstalacao ? "draft" : "published",
    system_prompt: "Você atende a clínica com clareza e educação.",
    provider: "openai",
    model: "gpt-5.6-luna",
    credential_id: opcoes.usaChaveDaInstalacao ? null : CREDENCIAL,
    tool_ids: ["crm_find_free_slots"],
    channel_session_id: CANAL,
    max_steps: 10,
    token_budget: 50_000,
    cost_budget_cents: 50,
    history_message_window: 20,
    history_token_window: 8_000,
    handoff_keywords: ["humano"],
    handoff_tool_enabled: true,
    cases_enabled: false,
    split_messages: false,
    split_max_chars: 600,
    followup: { enabled: false, flow_pointer_ids: [] },
    operator_enabled: false,
    operator_model: null,
    operator_tool_ids: [],
    pipeline_ids: [],
    knowledge_source_ids: [],
    trigger_config: {
      events: ["message"],
      filters: {
        ignore_groups: true,
        ignore_self: true,
        keyword_regex: null,
        business_hours: {
          timezone: "America/Sao_Paulo",
          start: "08:00",
          end: "18:00",
          weekdays: [1, 2, 3, 4, 5],
        },
      },
      concurrency: "one_per_conversation",
    },
  };
  return render(
    <QueryClientProvider client={qc}>
      <AgentForm
        mode="edit"
        agent={{
          id: "agent-1",
          organization_id: "org-1",
          name: "Recepção",
          description: "Atende pacientes",
          priority: 0,
          kind: "mcp_agent",
          published_version_id: "version-1",
        } as never}
        credentials={[
          {
            id: CREDENCIAL,
            provider: "openai",
            label: "Chave validada",
            is_active: true,
            validated_at: "2026-09-12T00:00:00Z",
          } as never,
          {
            id: "33333333-3333-4333-8333-333333333333",
            provider: "google",
            label: "Chave Google",
            is_active: true,
            validated_at: "2026-09-12T00:00:00Z",
          } as never,
        ]}
        channelSessions={[
          {
            id: CANAL,
            display_name: "Recepção",
            status: "WORKING",
            phone_number: null,
            ai_access_mode: "open",
            ai_test_phone_count: 0,
          },
        ]}
        provedoresDaInstalacao={
          opcoes.usaChaveDaInstalacao && opcoes.instalacaoTemChave !== false
            ? ["openai"]
            : []
        }
        draft={opcoes.usaChaveDaInstalacao ? version as never : null}
        published={opcoes.usaChaveDaInstalacao ? null : version as never}
        base={version as never}
        draftObsoleto={null}
      />
    </QueryClientProvider>,
  );
}

describe("editor de agente simplificado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    acoes.criar.mockResolvedValue({ ok: true, data: { agent_id: "agent-1" } });
    api.get.mockImplementation(async (url: string) => {
      if (url === "/api/v1/mcp/tools") return { data: { tools: [] } };
      if (url === "/api/v1/ai/followup-flows") return { data: [] };
      if (url.includes("/google/models")) {
        return {
          data: {
            models: [
              {
                provider: "google",
                model_id: "gemini-3-flash",
                display_name: "Gemini 3 Flash",
                context_window: 128_000,
                is_default_for_provider: true,
              },
            ],
          },
        };
      }
      return {
        data: {
          models: [
            {
              provider: "openai",
              model_id: "gpt-5.6-luna",
              display_name: "GPT-5.6 Luna",
              context_window: 128_000,
              is_default_for_provider: true,
            },
          ],
        },
      };
    });
  });

  it("começa com as decisões técnicas recolhidas e as seis decisões de negócio fora delas", () => {
    const { container } = abrirNovo();
    fireEvent.click(container.querySelector("#bh_enabled")!);
    const avancado = screen.getByTestId("configuracao-avancada-do-agente");
    expect(avancado).not.toHaveAttribute("open");
    expect(container.querySelector("#bh_tz")).toHaveValue("America/Recife");

    for (const id of [
      "priority",
      "provider",
      "model",
      "credential_id",
      "max_steps",
      "token_budget",
      "cost_budget_cents",
      "history_message_window",
      "history_token_window",
      "split_max_chars",
      "bh_tz",
    ]) {
      expect(avancado.querySelector(`#${id}`), `#${id} não está em Avançado`).toBeTruthy();
    }

    for (const id of ["name", "description", "channel_session_id", "handoff_kw", "ignore_groups", "bh_enabled"]) {
      const field = container.querySelector(`#${id}`);
      expect(field, `#${id} sumiu da configuração principal`).toBeTruthy();
      expect(avancado.contains(field), `#${id} foi escondido em Avançado`).toBe(false);
    }
  });

  it("mantém todos os campos movidos editáveis e preserva seus valores ao salvar", async () => {
    acoes.salvar.mockResolvedValue({ ok: true, data: { version_id: "version-2", version_number: 2 } });
    const { container } = abrirEdicao();
    const avancado = screen.getByTestId("configuracao-avancada-do-agente") as HTMLDetailsElement;
    avancado.open = true;
    expect(container.querySelector("#bh_tz")).toHaveValue("America/Sao_Paulo");

    const novos = {
      priority: 700,
      max_steps: 14,
      token_budget: 64_000,
      cost_budget_cents: 90,
      history_message_window: 32,
      history_token_window: 12_000,
      split_max_chars: 840,
    };
    for (const [id, value] of Object.entries(novos)) {
      const campo = container.querySelector(`#${id}`) as HTMLInputElement;
      expect(campo.disabled, `#${id} virou somente leitura`).toBe(false);
      fireEvent.change(campo, { target: { value: String(value) } });
    }
    await vi.waitFor(() => {
      for (const id of ["provider", "model", "credential_id"]) {
        expect((container.querySelector(`#${id}`) as HTMLButtonElement).disabled).toBe(false);
      }
    });
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole("combobox", { name: /empresa de inteligência/i }));
    await user.click(screen.getByRole("option", { name: /google/i }));
    await user.click(await screen.findByRole("combobox", { name: /^modelo$/i }));
    await user.click(await screen.findByRole("option", { name: /gemini 3 flash/i }));
    await user.click(screen.getByRole("combobox", { name: /chave de acesso/i }));
    await user.click(screen.getByRole("option", { name: /chave google/i }));
    fireEvent.change(container.querySelector("#bh_tz")!, { target: { value: "America/Recife" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar rascunho/i }));

    await vi.waitFor(() => expect(acoes.salvar).toHaveBeenCalledOnce());
    expect(acoes.salvar.mock.calls[0]?.[2]).toMatchObject({ priority: novos.priority });
    expect(acoes.salvar.mock.calls[0]?.[1]).toMatchObject({
      provider: "google",
      model: "gemini-3-flash",
      credential_id: "33333333-3333-4333-8333-333333333333",
      max_steps: novos.max_steps,
      token_budget: novos.token_budget,
      cost_budget_cents: novos.cost_budget_cents,
      history_message_window: novos.history_message_window,
      history_token_window: novos.history_token_window,
      split_max_chars: novos.split_max_chars,
      trigger_config: { filters: { business_hours: { timezone: "America/Recife" } } },
    });
  });

  it("cria um agente utilizável sem abrir Avançado quando há um único número", async () => {
    const { container } = abrirNovo();
    fireEvent.change(container.querySelector("#name")!, { target: { value: "Recepção" } });
    fireEvent.click(screen.getByRole("button", { name: /criar agente/i }));

    await vi.waitFor(() => expect(acoes.criar).toHaveBeenCalledOnce());
    expect(acoes.criar.mock.calls[0]?.[0]).toMatchObject({
      name: "Recepção",
      version: {
        provider: "openai",
        model: "gpt-5.6-luna",
        credential_id: CREDENCIAL,
        channel_session_id: CANAL,
        tool_ids: ["crm_find_free_slots"],
      },
    });
  });

  it("não bloqueia a publicação quando o agente usa a chave da instalação", () => {
    abrirEdicao({ usaChaveDaInstalacao: true });

    expect(screen.getByRole("button", { name: /publicar v1/i })).toBeEnabled();
    expect(screen.queryByText(/escolha a chave de acesso/i)).not.toBeInTheDocument();
  });

  it("mostra fora de Avançado quando a chave da instalação deixou de existir", () => {
    abrirEdicao({ usaChaveDaInstalacao: true, instalacaoTemChave: false });

    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent(/falta concluir a configuração da inteligência/i);
    expect(alerta).toHaveTextContent(/não encontrou automaticamente/i);
    expect(alerta).toContainElement(screen.getByRole("link", { name: /cadastrar credencial/i }));
    expect(screen.getByRole("button", { name: /publicar v1/i })).toBeDisabled();
  });
});
