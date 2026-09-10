import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ prepare: vi.fn(), confirm: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/app/actions/onboarding/prepararRascunho", () => ({ prepararRascunho: f.prepare }));
vi.mock("@/app/actions/onboarding/concluir", () => ({ confirmarAgenteRevisado: f.confirm }));
vi.mock("@/app/actions/onboarding/ensaio", () => ({ iniciarEnsaio: vi.fn(), revisarEnsaio: vi.fn(), lerEnsaio: vi.fn() }));
import { Ensaio } from "@/app/onboarding/setup-ai/_ensaio";
afterEach(() => { cleanup(); vi.clearAllMocks(); });

// O criador legado saiu do wizard. A recuperação agora pertence ao ensaio;
// o backend legado continua coberto em onboarding-agente-nao-publicado.
it.each(["draft_model_unavailable", "draft_credential_unavailable"])("%s conserva mensagem e saída sem avançar", async (error) => {
  f.prepare.mockResolvedValue({ ok: false, error });
  render(<Ensaio context={"a".repeat(64)} revision={1} dirty={false} epoch={0} onBusy={() => {}} initial={{ ok: true, panel: { selection: null, proof: null, models: [{ provider: "openai", model_id: "qa", display_name: "QA" }], credentials: [] } }} />);
  fireEvent.change(screen.getByLabelText("Modelo do ensaio"), { target: { value: "openai/qa" } });
  fireEvent.change(screen.getByLabelText("Mensagem de exemplo"), { target: { value: "Pergunta sintética QA" } });
  fireEvent.click(screen.getByRole("button", { name: "Preparar ensaio" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(error === "draft_model_unavailable" ? "Este modelo não está disponível" : "Esta credencial não está disponível");
  expect(screen.getByLabelText("Mensagem de exemplo")).toHaveValue("Pergunta sintética QA");
  expect(screen.getByRole("button", { name: "Continuar configuração" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Explorar o CRM" })).not.toBeInTheDocument();
  expect(f.confirm).not.toHaveBeenCalled();
});
