import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { OnboardingState } from "@/lib/schemas/onboarding";
import { proximoPasso } from "@/lib/onboarding/passos";

const f = vi.hoisted(() => ({ read: vi.fn(), channels: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); } }));
vi.mock("@/lib/auth/server", () => ({ requireAuth: async () => ({ id: "user", idioma: "pt-BR" }), resolveActiveOrg: async () => ({ orgId: "org" }) }));
vi.mock("@/lib/onboarding/jornada", () => ({ lerJornada: f.read }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/channels/selectable", () => ({ listSelectableChannels: f.channels }));
vi.mock("@/lib/channels/meta/webhook", () => ({ metaPodeReceber: () => false }));
vi.mock("@/lib/waha/client", () => ({ getWahaClient: () => null }));
// As integrações/clientes têm seus testes próprios. Aqui o servidor decide
// se a pessoa sequer chega a eles; o redirect era anterior ao primeiro render.
vi.mock("@/app/onboarding/connect-whatsapp/_client", () => ({ ConnectWhatsappClient: () => <div data-testid="formas-de-conexao" /> }));
vi.mock("@/app/onboarding/connect-whatsapp/_autorizacao", () => ({ AutorizacaoRestrita: () => <div data-testid="ativacao-restrita" /> }));
vi.mock("@/app/onboarding/_components/ExplorarCrm", () => ({ ExplorarCrm: () => <button>Explorar o CRM</button> }));
import Page from "@/app/onboarding/connect-whatsapp/page";

const welcome: OnboardingState["welcome"] = { accepted_at: "2026-09-10", display_name: "Empresa de teste", timezone: "UTC" };
beforeEach(() => { cleanup(); vi.clearAllMocks(); f.read.mockResolvedValue({ state: { welcome }, context: "context" }); f.channels.mockResolvedValue([]); });

it("primeiro acesso oferece conexão antes de pedir IA", () => {
  expect(proximoPasso({ welcome }, { lojaLigada: false })?.segmento).toBe("connect-whatsapp");
});
it("sem IA chega à escolha de conexão, sem oferecer ativação sem revisão", async () => {
  render(await Page());
  expect(screen.getByTestId("formas-de-conexao")).toBeInTheDocument();
  expect(screen.queryByTestId("ativacao-restrita")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Explorar o CRM" })).toBeInTheDocument();
});
it("quem adiou IA também pode conectar sem revisão", async () => {
  f.read.mockResolvedValue({ state: { welcome, ai: { agent_id: "", skipped: true } }, context: "context" });
  render(await Page());
  expect(screen.getByTestId("formas-de-conexao")).toBeInTheDocument();
  expect(screen.queryByTestId("ativacao-restrita")).not.toBeInTheDocument();
});
it("sem negócio confirmado continua protegido", async () => {
  f.read.mockResolvedValue({ state: {}, context: "context" });
  await expect(Page()).rejects.toThrow("REDIRECT:/onboarding/welcome");
});
it("erro ao consultar canais é visível e não vira lista vazia silenciosa", async () => {
  f.channels.mockRejectedValue(new Error("indisponível"));
  render(await Page());
  expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar os canais");
});
it("revisão válida continua oferecendo ativação restrita sem alterar o estado", async () => {
  const state: OnboardingState = { welcome, ai: {
    agent_id: "11111111-1111-4111-8111-111111111111", flow: "reviewed_draft_v2",
    revision: 1, version_id: "22222222-2222-4222-8222-222222222222",
    run_id: "33333333-3333-4333-8333-333333333333",
  } };
  const before = structuredClone(state);
  f.read.mockResolvedValue({ state, context: "a".repeat(64) });
  render(await Page());
  expect(screen.getByTestId("formas-de-conexao")).toBeInTheDocument();
  expect(screen.getByTestId("ativacao-restrita")).toBeInTheDocument();
  expect(state).toEqual(before);
});
it("agente legado permite conexão sem inventar uma revisão nem alterar a política", async () => {
  const state: OnboardingState = { welcome, ai: { agent_id: "legado", prompt_template: "existente" } };
  const before = structuredClone(state);
  f.read.mockResolvedValue({ state, context: "a".repeat(64) });
  render(await Page());
  expect(screen.getByTestId("formas-de-conexao")).toBeInTheDocument();
  expect(screen.queryByTestId("ativacao-restrita")).not.toBeInTheDocument();
  expect(state).toEqual(before);
});
