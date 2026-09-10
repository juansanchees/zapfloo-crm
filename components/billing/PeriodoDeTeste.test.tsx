import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PeriodoDeTeste } from "./PeriodoDeTeste";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("aviso de período de testes", () => {
  it("informa prazo absoluto com fuso e atualiza até encerrar sem recarregar", () => {
    vi.useFakeTimers();
    const agora = Date.parse("2026-09-10T15:00:00Z");
    vi.setSystemTime(agora);
    render(<PeriodoDeTeste fim="2026-09-10T15:01:00Z" agora={agora} />);
    expect(screen.getByText("Você está no período de testes grátis")).toBeVisible();
    expect(screen.getByText(/10\/09\/2026.*12:01/)).toBeVisible();
    expect(screen.getByText(/horário de Brasília/)).toBeVisible();
    expect(screen.getByText(/Tempo restante:/)).toHaveTextContent("0 h · 1 min");
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText("Seu período de testes terminou")).toBeVisible();
    expect(screen.queryByText(/Tempo restante:/)).toBeNull();
  });
  it("mantém o prazo ao remontar e usa o prazo da empresa selecionada", () => {
    const agora = Date.parse("2026-09-10T00:00:00Z");
    const view = render(<PeriodoDeTeste fim="2026-09-15T00:00:00Z" agora={agora} />);
    expect(screen.getByText(/Tempo restante:/)).toHaveTextContent("5 dias");
    view.rerender(<PeriodoDeTeste fim="2026-09-12T00:00:00Z" agora={agora} />);
    expect(screen.getByText(/Tempo restante:/)).toHaveTextContent("2 dias");
  });
  it("informa falha de leitura sem inventar teste ativo ou vencido", () => {
    render(<PeriodoDeTeste fim={null} agora={Date.now()} />);
    expect(screen.getByText(/Não foi possível consultar/)).toBeVisible();
    expect(screen.queryByText("Seu período de testes terminou")).toBeNull();
  });
});
