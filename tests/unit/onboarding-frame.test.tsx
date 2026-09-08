import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/branding/contexto", () => ({
  useMarcaDaInstalacao: () => ({ name: "Marca QA", logoUrl: "/qa-logo.svg" }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/onboarding/setup-ai" }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));

import { OnboardingFrame } from "@/app/onboarding/_components/OnboardingFrame";

afterEach(cleanup);
const passos = [
  { segmento: "welcome", rotulo: "Seu negócio", cumprido: true },
  { segmento: "setup-ai", rotulo: "Treinar", cumprido: false },
];

describe("estrutura visual do onboarding", () => {
  it("preserva marca resolvida, organização, controles e conteúdo", () => {
    render(<OnboardingFrame orgName="Empresa QA" passos={passos} controls={<button>Outra empresa</button>}>
      <input aria-label="Nome do negócio" />
    </OnboardingFrame>);
    expect(screen.getByRole("img", { name: "Marca QA" })).toHaveAttribute("src", "/qa-logo.svg");
    expect(screen.getByRole("heading", { name: "Empresa QA" })).toBeVisible();
    expect(screen.getByLabelText("Nome do negócio")).toBeVisible();
    expect(screen.getByRole("button", { name: "Outra empresa" })).toBeVisible();
  });

  it("mostra apenas os passos fornecidos, mantendo a etapa atual e sem ativação decorativa", () => {
    render(<OnboardingFrame orgName="Empresa QA" passos={passos}><p>Formulário real</p></OnboardingFrame>);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(screen.queryByRole("button", { name: /ativar|conectar/i })).toBeNull();
  });
});
