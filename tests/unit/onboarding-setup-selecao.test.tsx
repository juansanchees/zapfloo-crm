import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ retrato: vi.fn().mockResolvedValue({ inteligencia: { origemDaChave: "nenhuma", provedor: "anthropic", rotulo: "Anthropic" } }), key: vi.fn(), skip: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ requireAuth: async () => ({ id: "user", idioma: "pt-BR" }), resolveActiveOrg: async () => ({ orgId: "org" }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/instalacao/retrato", () => ({ lerRetratoDaInstalacao: f.retrato }));
vi.mock("@/app/onboarding/setup-ai/_inteligencia", () => ({ InteligenciaDele: () => <p>Ele ainda não tem cérebro: Anthropic</p> }));
vi.mock("@/app/onboarding/setup-ai/_form", () => ({ SetupAiForm: () => <p>Seleção explícita do ensaio</p> }));
vi.mock("@/app/actions/onboarding/_shared", () => ({ loadOnboardingState: async () => ({ state: { welcome: { display_name: "QA" } } }) }));
vi.mock("@/app/actions/onboarding/rascunho", () => ({ lerRascunho: async () => ({ ok: true, context: "a".repeat(64) }) }));
vi.mock("@/app/actions/onboarding/ensaio", () => ({ lerEnsaio: async () => ({ ok: true, panel: { models: [], credentials: [] } }) }));
vi.mock("@/app/actions/onboarding/explorar", () => ({ gerenciarAgenteDoOnboarding: vi.fn(), configurarChaveDoOnboarding: f.key }));
vi.mock("@/app/actions/onboarding/createDefaultAgent", () => ({ skipAi: f.skip }));
import SetupAiPage from "@/app/onboarding/setup-ai/page";
afterEach(cleanup);
it("o setup não presume provider default nem dispara prova automática; oferece gestão de chave", async () => {
  render(await SetupAiPage());
  expect(screen.queryByText(/ainda não tem cérebro|Anthropic/)).not.toBeInTheDocument();
  expect(f.retrato).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Configurar chave de IA" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Adiar IA e continuar" })).toBeInTheDocument();
});

it("conflito ao adiar fica visível e oferece recarregar a etapa", async () => {
  f.skip.mockResolvedValueOnce({ ok: false, error: "draft_context_changed" });
  render(await SetupAiPage());

  fireEvent.click(screen.getByRole("button", { name: "Adiar IA e continuar" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "A organização ativa mudou. Recarregue esta etapa antes de adiar a IA.",
  );
  expect(screen.getByRole("link", { name: "Recarregar esta etapa" })).toHaveAttribute(
    "href",
    "/onboarding/setup-ai",
  );
});
