import { beforeEach, expect, it, vi } from "vitest";
import { contextoDoRascunho } from "@/lib/onboarding/contexto-rascunho";
import { onboardingStateSchema, welcomeSchema } from "@/lib/schemas/onboarding";
const f = vi.hoisted(() => ({ load: vi.fn(), patch: vi.fn(), admin: vi.fn(), after: vi.fn(), processar: vi.fn() }));
vi.mock("@/app/actions/onboarding/_shared", () => ({ requireOnboardingCtx: async () => ({ orgId: "org", userId: "user" }), loadOnboardingState: f.load, patchOnboardingState: f.patch, OnboardingError: class extends Error {} }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: f.admin }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: f.after }));
vi.mock("@/lib/onboarding/site/servico", () => ({ processarSiteDaOrganizacao: f.processar }));
import { acceptWelcome } from "@/app/actions/onboarding/acceptWelcome";
beforeEach(() => { vi.clearAllMocks(); f.load.mockResolvedValue({ state: {}, onboardedAt: "2026-09-08T12:00:00Z" }); });
function form(context = contextoDoRascunho("user", "org")) { const f = new FormData(); f.set("display_name", "QA"); f.set("expected_context", context); return f; }
it("formulário de outra organização não altera negócio da sessão nova", async () => {
  expect(await acceptWelcome(form(contextoDoRascunho("user", "outra")))).toMatchObject({ ok: false, error: "forbidden" });
  expect(f.patch).not.toHaveBeenCalled(); expect(f.admin).not.toHaveBeenCalled();
});
it("organização já concluída permanece intacta", async () => {
  expect(await acceptWelcome(form())).toMatchObject({ ok: false, error: "forbidden" });
  expect(f.patch).not.toHaveBeenCalled(); expect(f.admin).not.toHaveBeenCalled();
});

it("normaliza site opcional no schema e preserva no estado já existente", () => {
  expect(welcomeSchema.parse({ display_name: "QA", site_do_negocio: "clinica.example" }).site_do_negocio).toBe("https://clinica.example/");
  expect(welcomeSchema.parse({ display_name: "QA", site_do_negocio: " " }).site_do_negocio).toBeUndefined();
  expect(welcomeSchema.safeParse({ display_name: "QA", site_do_negocio: "instagram.com/qa" }).success).toBe(false);
  expect(onboardingStateSchema.parse({ welcome: { display_name: "QA", timezone: "UTC", accepted_at: "now", site_do_negocio: "https://clinica.example/" } }).welcome?.site_do_negocio).toBe("https://clinica.example/");
});

function bancoGrava() {
  const q = { update: vi.fn(), eq: vi.fn(), is: vi.fn(), select: vi.fn(), maybeSingle: vi.fn() };
  q.update.mockReturnValue(q); q.eq.mockReturnValue(q); q.is.mockReturnValue(q); q.select.mockReturnValue(q);
  q.maybeSingle.mockResolvedValue({ data: { id: "org" }, error: null });
  f.admin.mockReturnValue({ from: vi.fn().mockReturnValue(q) });
  f.load.mockResolvedValue({ state: {}, onboardedAt: null });
  return q;
}

it("salva antes e agenda leitura após resposta, sem esperar site lento", async () => {
  const q = bancoGrava();
  const fd = form(); fd.set("site_do_negocio", "clinica.example");
  f.processar.mockImplementation(() => new Promise(() => {}));
  await acceptWelcome(fd);
  expect(q.update).toHaveBeenCalledWith(expect.objectContaining({ onboarding_state: expect.objectContaining({ welcome: expect.objectContaining({ site_do_negocio: "https://clinica.example/", site_leitura_pendente: true }) }) }));
  expect(f.after).toHaveBeenCalledOnce();
  expect(f.processar).not.toHaveBeenCalled();
  const callback = f.after.mock.calls[0]?.[0] as () => Promise<void>;
  void callback();
  expect(f.processar).toHaveBeenCalledWith("org");
});

it("endereço vazio segue sem disparar leitura; rede social recusa antes de gravar", async () => {
  bancoGrava();
  await acceptWelcome(form());
  expect(f.after).not.toHaveBeenCalled();
  f.admin.mockClear();
  const fd = form(); fd.set("site_do_negocio", "facebook.com/qa");
  expect(await acceptWelcome(fd)).toMatchObject({ ok: false, error: "invalid_input" });
  expect(f.admin).not.toHaveBeenCalled();
});

it("falha ao salvar não dispara trabalho solto", async () => {
  const q = bancoGrava(); q.maybeSingle.mockResolvedValue({ data: null, error: { message: "conflito" } });
  const fd = form(); fd.set("site_do_negocio", "clinica.example");
  expect(await acceptWelcome(fd)).toMatchObject({ ok: false, error: "db_error" });
  expect(f.after).not.toHaveBeenCalled();
});
