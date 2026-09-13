import { beforeEach, expect, it, vi } from "vitest";
import { PACOTE_PADRAO } from "@/lib/onboarding/pacotes-de-funil";

const f = vi.hoisted(() => ({ contexto: vi.fn(), processar: vi.fn(), generate: vi.fn(), publicado: true }));
vi.mock("@/app/actions/onboarding/_shared", () => ({
  requireOnboardingCtx: async () => ({ orgId: "org-a", orgName: "Negócio QA", userId: "user-a" }),
  loadOnboardingState: async () => ({ state: { welcome: { o_que_faz: "Serviços locais" } } }),
  patchOnboardingState: vi.fn(), OnboardingError: class extends Error {},
}));
vi.mock("@/lib/onboarding/site/servico", () => ({ lerContextoDoSite: f.contexto, processarSiteDaOrganizacao: f.processar }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("ai", () => ({ generateText: f.generate }));
vi.mock("@/lib/ai/runtime/agent", () => ({ buildModel: () => "modelo-sintetico", chaveDePlataforma: () => "chave-sintetica" }));
vi.mock("@/lib/ai/credentials", () => ({ loadCredential: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => {
  const q = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  q.select.mockReturnValue(q); q.eq.mockReturnValue(q);
  q.maybeSingle.mockResolvedValue({ data: table === "ai_agents"
    ? { published_version_id: f.publicado ? "version-a" : null }
    : table === "ai_agent_versions" ? { provider: "openai", model: "modelo-sintetico", credential_id: null } : null });
  return q;
} }) }));

import { dadosDoPasso } from "@/app/actions/onboarding/montarQuadro";

beforeEach(() => {
  vi.clearAllMocks();
  f.publicado = true;
  f.contexto.mockResolvedValue(null);
  f.processar.mockImplementation(() => new Promise(() => {}));
  f.generate.mockResolvedValue({ text: JSON.stringify(PACOTE_PADRAO.proposta) });
});

it("site lento/em andamento não é aguardado nem relido ao abrir o quadro", async () => {
  const resultado = await dadosDoPasso();
  expect(resultado.sugestao.origem).toBe("ia");
  expect(resultado.sugestao).not.toHaveProperty("siteUsado");
  expect(f.contexto).toHaveBeenCalledWith("org-a");
  expect(f.processar).not.toHaveBeenCalled();
  expect(f.generate.mock.calls[0]?.[0].prompt).not.toContain("DADOS_DO_SITE");
});

it("fonte já lida alimenta a proposta sem iniciar rede do site", async () => {
  const site = { endereco: "https://negocio.example/", resumo: "Cursos de música e aulas individuais" };
  f.contexto.mockResolvedValue(site);
  const resultado = await dadosDoPasso();
  expect(resultado.sugestao).toMatchObject({ origem: "ia", siteUsado: site.endereco });
  expect(f.generate.mock.calls[0]?.[0].prompt).toContain(JSON.stringify(site));
  expect(f.processar).not.toHaveBeenCalled();
});

it("sem funcionário publicado preserva pacote e motivo, mesmo com site lido", async () => {
  f.publicado = false;
  f.contexto.mockResolvedValue({ endereco: "https://negocio.example/", resumo: "Cursos" });
  const resultado = await dadosDoPasso();
  expect(resultado.sugestao).toMatchObject({ origem: "pacote", porque: "seu funcionário ainda não está no ar" });
  expect(resultado.sugestao).not.toHaveProperty("siteUsado");
  expect(f.generate).not.toHaveBeenCalled();
});
