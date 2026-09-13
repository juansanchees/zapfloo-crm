import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider, useTheme } from "@/lib/theme";
import { ThemeToggle } from "@/components/theme/theme-toggle";

// Executa o script REAL enviado no head, antes de React participar da página.
const layout = readFileSync("app/layout.tsx", "utf8");
const script = layout.match(/const THEME_INIT_SCRIPT = `([^`]+)`;/)?.[1];
if (!script) throw new Error("Script inicial do tema não encontrado");

const casos = [
  [null, true, "light"],
  [null, false, "light"],
  ["dark", false, "dark"],
  ["light", true, "light"],
  ["system", true, "dark"],
  ["system", false, "light"],
  ["invalido", true, "light"],
] as const;

function Sonda() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return <>
    <output data-testid="tema">{theme}/{resolvedTheme}</output>
    <button onClick={() => setTheme("dark")}>Escuro</button>
  </>;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("tema antes da primeira pintura", () => {
  it.each(casos)("preferência %s, sistema escuro %s → %s", (salvo, escuro, esperado) => {
    const setAttribute = vi.fn();
    const storage = { getItem: vi.fn(() => salvo), setItem: vi.fn() };
    runInNewContext(script, {
      localStorage: storage,
      window: { matchMedia: () => ({ matches: escuro }) },
      document: { documentElement: { setAttribute } },
    });
    expect(setAttribute).toHaveBeenCalledExactlyOnceWith("data-theme", esperado);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("usa claro se o armazenamento estiver indisponível", () => {
    const setAttribute = vi.fn();
    runInNewContext(script, {
      localStorage: { getItem: () => { throw new Error("indisponível"); } },
      document: { documentElement: { setAttribute } },
    });
    expect(setAttribute).toHaveBeenCalledExactlyOnceWith("data-theme", "light");
  });
});

describe("preferência depois da hidratação", () => {
  it.each(casos)("mantém preferência %s com sistema escuro %s → %s", (salvo, escuro, esperado) => {
    vi.stubGlobal("matchMedia", () => ({ matches: escuro, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    if (salvo !== null) localStorage.setItem("deskcomm-theme", salvo);
    render(<ThemeProvider><Sonda /></ThemeProvider>);
    const preferencia = salvo === "system" ? "system" : esperado;
    expect(screen.getByTestId("tema").textContent).toBe(`${preferencia}/${esperado}`);
    expect(document.documentElement.getAttribute("data-theme")).toBe(esperado);
    expect(localStorage.getItem("deskcomm-theme")).toBe(salvo);
  });

  it("persiste uma escolha explícita e a respeita na próxima montagem", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const tela = render(<ThemeProvider><Sonda /></ThemeProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Escuro" }));
    expect(localStorage.getItem("deskcomm-theme")).toBe("dark");
    tela.unmount();
    render(<ThemeProvider><Sonda /></ThemeProvider>);
    expect(screen.getByTestId("tema").textContent).toBe("dark/dark");
  });

  it("o servidor oferece claro como padrão", () => {
    vi.stubGlobal("window", undefined);
    expect(renderToString(<ThemeProvider><Sonda /></ThemeProvider>)).toContain("light<!-- -->/<!-- -->light");
  });

  it("hidrata o seletor com a escolha salva sem reaplicar claro nem deixar o rótulo do servidor", async () => {
    vi.stubGlobal("window", undefined);
    const html = renderToString(<ThemeProvider><ThemeToggle /></ThemeProvider>);
    vi.unstubAllGlobals();
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    localStorage.setItem("deskcomm-theme", "dark");
    // Estado que o script síncrono já aplicou antes da hidratação.
    document.documentElement.setAttribute("data-theme", "dark");
    const aplicar = vi.spyOn(document.documentElement, "setAttribute");
    const erros = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);
    let root: Root | undefined;
    try {
      await act(async () => { root = hydrateRoot(container, <ThemeProvider><ThemeToggle /></ThemeProvider>); });
      expect(container.querySelector("button")?.getAttribute("aria-label")).toContain("Tema: dark.");
      expect(aplicar).not.toHaveBeenCalledWith("data-theme", "light");
      expect(localStorage.getItem("deskcomm-theme")).toBe("dark");
      expect(erros).not.toHaveBeenCalled();
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });
});
