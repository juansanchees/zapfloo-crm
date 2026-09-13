import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/onboarding/acceptWelcome", () => ({ acceptWelcome: vi.fn() }));
vi.mock("@/app/actions/onboarding/finishOnboarding", () => ({ finishOnboarding: vi.fn() }));
vi.mock("@/app/actions/onboarding/montarQuadro", () => ({ aplicarQuadro: vi.fn(), pularQuadro: vi.fn() }));

import { WelcomeForm } from "@/app/onboarding/welcome/_form";
import { DoneClient } from "@/app/onboarding/done/_client";
import { QuadroClient } from "@/app/onboarding/funil/_client";
import { PACOTE_PADRAO } from "@/lib/onboarding/pacotes-de-funil";
import { finishOnboarding } from "@/app/actions/onboarding/finishOnboarding";

afterEach(cleanup);
beforeEach(() => { sessionStorage.clear(); vi.clearAllMocks(); });

describe("site opcional no mesmo passo de boas-vindas", () => {
  it("vazio não exige preenchimento e endereço salvo reaparece na retomada", () => {
    const { rerender } = render(<WelcomeForm defaultOrgName="Clínica QA" />);
    expect(screen.getByLabelText("Site do seu negócio (opcional)")).not.toBeRequired();
    rerender(<WelcomeForm key="retomada" defaultOrgName="Clínica QA" initial={{
      display_name: "Clínica QA", timezone: "UTC", accepted_at: "2026-09-12T12:00:00Z",
      site_do_negocio: "https://clinica.example/",
    }} />);
    expect(screen.getByLabelText("Site do seu negócio (opcional)")).toHaveValue("https://clinica.example/");
    expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled();
  });

  it.each(["instagram.com/clinica", "www.facebook.com/clinica"])("recusa %s no campo, sem chamar leitor", async (endereco) => {
    const user = userEvent.setup();
    render(<WelcomeForm defaultOrgName="Clínica QA" />);
    const site = screen.getByLabelText("Site do seu negócio (opcional)");
    await user.type(site, endereco);
    expect(screen.getByRole("alert")).toHaveTextContent("Não consigo ler o Instagram ou o Facebook — se tiver um site, cole aqui.");
    expect(site).toHaveAttribute("aria-invalid", "true");
    await user.clear(site);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(site).not.toHaveAttribute("aria-invalid", "true");
  });
});

describe("resultado real do site no quadro", () => {
  it("identifica o endereço só quando ele alimentou uma sugestão válida", () => {
    const { rerender } = render(<QuadroClient atual={null} sugestao={{ origem: "ia", proposta: PACOTE_PADRAO.proposta, siteUsado: "https://clinica.example/" }} />);
    expect(screen.getByText(/Li o seu site/)).toHaveTextContent("https://clinica.example/");
    rerender(<QuadroClient atual={null} sugestao={{ origem: "pacote", pacote: PACOTE_PADRAO, porque: "a leitura não terminou" }} />);
    expect(screen.queryByText(/Li o seu site/)).toBeNull();
    expect(screen.getByText(/Não consegui pedir uma sugestão/)).toHaveTextContent("a leitura não terminou");
  });
});

describe("conferência no fim sem bloquear o primeiro uso", () => {
  it("não oferece um cartão vazio", () => {
    render(<DoneClient itens={[]} pecas={[]} orgId="org-a" site={{ produtos: 0, perguntas: 0, fonteId: null }} />);
    expect(screen.queryByRole("region", { name: "Também preparei, do seu site:" })).toBeNull();
    expect(screen.getByRole("button", { name: "Começar a usar" })).toBeEnabled();
  });

  it("mostra contagens reais e abre as duas revisões existentes", async () => {
    const user = userEvent.setup();
    render(<DoneClient itens={[]} pecas={[]} orgId="org-a" site={{ produtos: 2, perguntas: 3, fonteId: "fonte-a" }} />);
    expect(screen.getByRole("region", { name: "Também preparei, do seu site:" })).toHaveTextContent("2 produtos com preço — aguardando sua conferência");
    expect(screen.getByRole("region", { name: "Também preparei, do seu site:" })).toHaveTextContent("3 perguntas frequentes — aguardando sua conferência");
    await user.click(screen.getByRole("button", { name: "Revisar agora" }));
    await user.click(screen.getByRole("button", { name: "Conferir produtos e preços" }));
    expect(finishOnboarding).toHaveBeenCalledWith("/app/products");
    await user.click(screen.getByRole("button", { name: "Conferir perguntas frequentes" }));
    expect(finishOnboarding).toHaveBeenCalledWith("/app/ai/knowledge/sources");
  });

  it("Depois dispensa sem bloquear e não volta a insistir na mesma organização", async () => {
    const user = userEvent.setup();
    const props = { itens: [], pecas: [], orgId: "org-a", site: { produtos: 1, perguntas: 0, fonteId: "fonte-a" } };
    const { unmount } = render(<DoneClient {...props} />);
    await user.click(screen.getByRole("button", { name: "Depois" }));
    expect(screen.queryByRole("region", { name: "Também preparei, do seu site:" })).toBeNull();
    expect(screen.getByRole("button", { name: "Começar a usar" })).toBeEnabled();
    unmount();
    const other = render(<DoneClient {...props} />);
    expect(screen.queryByRole("region", { name: "Também preparei, do seu site:" })).toBeNull();
    other.unmount();
    render(<DoneClient {...props} orgId="org-b" />);
    expect(screen.getByRole("region", { name: "Também preparei, do seu site:" })).toBeVisible();
  });
});
