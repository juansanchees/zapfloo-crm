import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/lib/i18n/IdiomaProvider", () => ({ IdiomaProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/lib/auth/server", () => ({
  requireAuth: async () => ({ id: "user", idioma: "pt-BR", locale: "pt-BR", organizations: [] }),
  resolveActiveOrg: async () => ({ orgId: "org", name: "Empresa QA", role: "admin" }),
}));
vi.mock("@/lib/auth/require-role", () => ({
  requireRole: async () => ({ ok: true, user: { id: "user" }, org: { orgId: "org", role: "admin" } }),
}));
vi.mock("@/lib/onboarding/jornada", () => ({
  lerJornada: async () => ({
    state: { welcome: { accepted_at: "2026-09-10", display_name: "Empresa QA", timezone: "UTC" } },
    onboardedAt: null,
    context: "a".repeat(64),
  }),
}));
vi.mock("@/lib/env", () => ({ env: { NUVEMSHOP_ENABLED: false } }));
vi.mock("@/app/onboarding/_components/OnboardingFrame", () => ({
  OnboardingFrame: ({ controls, children }: { controls: React.ReactNode; children: React.ReactNode }) => <><header>{controls}</header><main>{children}</main></>,
  NomeDaInstalacao: () => <>Produto QA</>,
}));
vi.mock("@/app/onboarding/_components/OutrasOrganizacoes", () => ({ OutrasOrganizacoes: () => null }));
vi.mock("@/app/onboarding/_components/SkipToEnd", () => ({ SkipToEnd: () => null }));
vi.mock("@/components/billing/PeriodoDeTesteDaOrganizacao", () => ({ PeriodoDeTesteDaOrganizacao: () => null }));
vi.mock("@/app/actions/onboarding/explorar", () => ({ explorarCrm: vi.fn() }));
vi.mock("@/app/actions/onboarding/skipWhatsapp", () => ({ markWhatsappConfigured: vi.fn(), skipWhatsapp: vi.fn() }));
vi.mock("@/components/connections/CanalOficialClient", () => ({ CanalOficialClient: () => null }));
vi.mock("@/components/connections/CanalParceiroClient", () => ({ CanalParceiroClient: () => null }));
vi.mock("@/app/actions/onboarding/concluir", () => ({ confirmarAgenteRevisado: vi.fn() }));
vi.mock("@/app/actions/onboarding/prepararRascunho", () => ({ prepararRascunho: vi.fn() }));
vi.mock("@/app/actions/onboarding/recuperarPreparacao", () => ({ recuperarPreparacao: vi.fn() }));
vi.mock("@/app/actions/onboarding/ensaio", () => ({ iniciarEnsaio: vi.fn(), revisarEnsaio: vi.fn(), lerEnsaio: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/instalacao/retrato", () => ({
  lerRetratoDaInstalacao: async () => ({ empresa: { aindaSemNomeProprio: true } }),
}));
vi.mock("@/app/actions/onboarding/_shared", () => ({
  loadOnboardingState: async () => ({ state: {}, onboardedAt: null }),
}));
vi.mock("@/app/onboarding/welcome/_form", () => ({ WelcomeForm: () => null }));
vi.mock("@/app/onboarding/_components/JaEstaPronto", () => ({ JaEstaPronto: () => null }));

import OnboardingLayout from "@/app/onboarding/layout";
import WelcomePage from "@/app/onboarding/welcome/page";
import { ConnectWhatsappClient } from "@/app/onboarding/connect-whatsapp/_client";
import { Ensaio } from "@/app/onboarding/setup-ai/_ensaio";

afterEach(cleanup);

async function renderizarNoLayout(children: React.ReactNode) {
  render(await OnboardingLayout({ children }));
}

function esperarUmaSaida() {
  expect(screen.getAllByRole("button", { name: "Explorar o CRM" })).toHaveLength(1);
}

describe("a saída persistente do onboarding tem uma única fonte", () => {
  it("compõe o layout real com o cliente de conexão sem duplicar a saída", async () => {
    await renderizarNoLayout(<ConnectWhatsappClient wahaConfigured={false} sessionName="org_qa" oficialPodeReceber={false} canaisIniciais={[]} />);
    esperarUmaSaida();
  });

  it("compõe o layout real com a página de boas-vindas sem duplicar a saída", async () => {
    await renderizarNoLayout(await WelcomePage());
    esperarUmaSaida();
  });

  it("compõe o layout real com o ensaio sem duplicar a saída", async () => {
    await renderizarNoLayout(<Ensaio initial={{ ok: false, error: "db_error" }} context={"a".repeat(64)} revision={0} dirty epoch={0} onBusy={() => {}} />);
    esperarUmaSaida();
  });
});
