import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRedirectError } from "next/dist/client/components/redirect";

const mocks = vi.hoisted(() => ({
  explorar: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@/app/actions/onboarding/explorar", () => ({ explorarCrm: mocks.explorar }));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));

import { ExplorarCrm } from "@/app/onboarding/_components/ExplorarCrm";

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saída segura do onboarding", () => {
  it("nomeia uma sessão expirada pelo código seguro devolvido pelo servidor", async () => {
    mocks.explorar.mockResolvedValueOnce({ ok: false, error: "auth_required" });

    render(<ExplorarCrm />);
    fireEvent.click(screen.getByRole("button", { name: "Explorar o CRM" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/sessão.*expirou/i);
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it("não envia a exceção crua à telemetria quando o transporte falha", async () => {
    mocks.explorar.mockRejectedValueOnce(new Error("token=SEGREDO_DO_CLIENTE"));

    render(<ExplorarCrm />);
    fireEvent.click(screen.getByRole("button", { name: "Explorar o CRM" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/falar com o servidor/i);
    const chamada = mocks.captureException.mock.calls[0];
    expect(chamada?.[0]).toMatchObject({ message: "onboarding_explore_transport_failed" });
    expect(JSON.stringify(chamada)).not.toContain("SEGREDO_DO_CLIENTE");
  });

  it("propaga um redirecionamento real do Next sem mostrar nem registrar falha", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.explorar.mockRejectedValueOnce(getRedirectError("/app/inbox", "replace", 307));

    class Boundary extends React.Component<React.PropsWithChildren, { falhou: boolean }> {
      state = { falhou: false };
      static getDerivedStateFromError() { return { falhou: true }; }
      render() { return this.state.falhou ? <p>REDIRECT_PROPAGADO</p> : this.props.children; }
    }

    render(<Boundary><ExplorarCrm /></Boundary>);
    fireEvent.click(screen.getByRole("button", { name: "Explorar o CRM" }));

    expect(await screen.findByText("REDIRECT_PROPAGADO")).toBeInTheDocument();
    expect(mocks.captureException).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    consoleError.mockRestore();
  });

  it.each([
    ["no_active_org", /empresa ativa/i],
    ["forbidden", /acesso não permite/i],
    ["mfa_required", /verificação de segurança/i],
    ["unavailable", /não conseguiu preparar/i],
  ] as const)("explica o código %s sem expor detalhe técnico", async (error, esperado) => {
    mocks.explorar.mockResolvedValueOnce({ ok: false, error });
    render(<ExplorarCrm />);
    fireEvent.click(screen.getByRole("button", { name: "Explorar o CRM" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(esperado);
    expect(mocks.captureException).not.toHaveBeenCalled();
  });
});
