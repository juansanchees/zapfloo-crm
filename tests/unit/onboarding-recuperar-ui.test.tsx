import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ recover: vi.fn(), prepare: vi.fn(), read: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/app/actions/onboarding/concluir", () => ({ confirmarAgenteRevisado: vi.fn() }));
vi.mock("@/app/actions/onboarding/prepararRascunho", () => ({ prepararRascunho: f.prepare }));
vi.mock("@/app/actions/onboarding/recuperarPreparacao", () => ({ recuperarPreparacao: f.recover }));
vi.mock("@/app/actions/onboarding/ensaio", () => ({ lerEnsaio: f.read, iniciarEnsaio: vi.fn(), revisarEnsaio: vi.fn() }));
import { Ensaio } from "@/app/onboarding/setup-ai/_ensaio";
const id = "11111111-1111-4111-8111-111111111111";
const models = [{ provider: "openai" as const, model_id: "qa", display_name: "QA" }];
afterEach(cleanup);
describe("saída visível para preparação arquivada", () => {
  it("agente apagado com a tela aberta atualiza o CAS antes de recuperar", async () => {
    f.recover.mockResolvedValue({ ok: true, revision: 1 });
    f.read.mockResolvedValue({ ok: true, panel: { selection: null, proof: null, models, credentials: [], recovery_available: true } });
    f.prepare.mockResolvedValue({ ok: false, error: "draft_unavailable" });
    render(<Ensaio initial={{ ok: true, panel: { selection: { revision: 1, agent_id: id, version_id: id, provider: "openai", model: "qa", credential_id: null }, proof: null, models, credentials: [] } }} context={"a".repeat(64)} revision={1} dirty={false} epoch={0} onBusy={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Preparar ensaio" }));
    fireEvent.click(await screen.findByRole("button", { name: "Recuperar preparação" }));
    await waitFor(() => expect(f.recover).toHaveBeenLastCalledWith(expect.objectContaining({ expected_version_id: null })));
  });
  it("recupera e volta a permitir preparar sem reutilizar versão obsoleta", async () => {
    f.recover.mockResolvedValue({ ok: true, revision: 1 });
    f.read.mockResolvedValue({ ok: true, panel: { selection: null, proof: null, models, credentials: [] } });
    f.prepare.mockResolvedValue({ ok: false, error: "draft_name_conflict" });
    render(<Ensaio initial={{ ok: true, panel: { selection: { revision: 1, agent_id: id, version_id: id, provider: "openai", model: "qa", credential_id: null }, proof: null, models, credentials: [], recovery_available: true } }} context={"a".repeat(64)} revision={1} dirty={false} epoch={0} onBusy={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Recuperar preparação" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Preparar ensaio" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Preparar ensaio" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("nome");
    expect(f.prepare).toHaveBeenLastCalledWith(expect.objectContaining({ expected_version_id: null }));
    expect(screen.getByRole("button", { name: "Continuar configuração" })).toBeDisabled();
  });
});
