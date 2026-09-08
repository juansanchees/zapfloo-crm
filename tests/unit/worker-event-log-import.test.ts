import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

// Simula um renderer quebrado/incompatível. Registrar o dreno não pode tocar
// nele: PDF só é dependência quando um evento LGPD realmente chega.
vi.mock("@/workers/lgpd-export-worker", () => {
  throw new Error("PDF_CARREGADO_NO_STARTUP");
});

describe("startup do worker e registro do event_log", () => {
  it("registra todos os handlers sem carregar o pipeline pesado de PDF", async () => {
    const modulo = await import("@/lib/event-log/register-handlers");
    expect(() => modulo.ensureHandlersRegistered()).not.toThrow();
  });

  it("executa o worker como ESM para respeitar os exports do renderer de PDF", () => {
    const dockerfile = readFileSync("Dockerfile.worker", "utf8");
    const main = readFileSync("workers/agent-worker/main.ts", "utf8");
    expect(dockerfile).toMatch(/p\.type\s*=\s*["']module["']/);
    expect(main).toMatch(/import Sentry from ["']@sentry\/nextjs["']/);
  });
});
