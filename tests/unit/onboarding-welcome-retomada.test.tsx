import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/app/actions/onboarding/acceptWelcome", () => ({ acceptWelcome: vi.fn() }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
import { WelcomeForm } from "@/app/onboarding/welcome/_form";
afterEach(cleanup);
it("retomar preserva negócio, descrição, segmento, fuso e aceite salvos", () => {
  render(<WelcomeForm defaultOrgName="Nome da organização" initial={{ display_name: "Nome salvo", o_que_faz: "Projetos sintéticos", segmento: "servicos", timezone: "Europe/Madrid", accepted_at: "2026-09-08T12:00:00Z" }} />);
  expect(screen.getByLabelText("Como se chama o seu negócio?")).toHaveValue("Nome salvo");
  expect(screen.getByLabelText("O que vocês fazem?")).toHaveValue("Projetos sintéticos");
  expect(screen.getByLabelText("Segmento do negócio")).toHaveValue("servicos");
  expect(screen.getByRole("checkbox")).toBeChecked();
  expect(document.querySelector('[name="timezone"]')).toHaveValue("Europe/Madrid");
});
