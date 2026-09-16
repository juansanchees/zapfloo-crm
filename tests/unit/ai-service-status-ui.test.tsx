import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ status: null as unknown, invalidate: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ isLoading: false, isError: false, data: f.status }),
  useQueryClient: () => ({ invalidateQueries: f.invalidate }),
}));
import { AiServiceStatus } from "@/components/ai/AiServiceStatus";

afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); });

describe("estado visível da IA", () => {
  it("allowlist vazia diz explicitamente que zero números recebem resposta", () => {
    f.status = { ativo: true, estado: "em_teste", motivo: null, numeros_autorizados: 0, canal_id: "11111111-1111-4111-8111-111111111111" };
    render(<AiServiceStatus canConfigure />);
    expect(screen.getByText("IA em teste — 0 números autorizados")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Liberar para todos" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Autorizar números" })).toHaveAttribute("href", "/app/connections");
  });

  it("saldo da plataforma não culpa a configuração do cliente", () => {
    f.status = { ativo: false, estado: "desligada", motivo: "saldo_da_plataforma", numeros_autorizados: 0, canal_id: null };
    render(<AiServiceStatus canConfigure />);
    expect(screen.getByText("IA desligada — a IA está indisponível no momento; já avisamos o suporte")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Corrigir agora" })).not.toBeInTheDocument();
  });
});
