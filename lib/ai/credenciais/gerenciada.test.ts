import { describe, expect, it, vi } from "vitest";

import {
  provedoresComCredencialGerenciada,
  resolverCredencialGerenciada,
} from "./gerenciada";

function bancoCom(resultado: { data: unknown; error: unknown }) {
  const terminal = {
    maybeSingle: vi.fn().mockResolvedValue(resultado),
    then: (resolve: (valor: typeof resultado) => unknown) => Promise.resolve(resultado).then(resolve),
  };
  const corrente: Record<string, unknown> = {
    select: vi.fn(() => corrente),
    eq: vi.fn(() => corrente),
    not: vi.fn(() => corrente),
    order: vi.fn(() => corrente),
    limit: vi.fn(() => terminal),
    then: terminal.then,
  };
  return { from: vi.fn(() => corrente) } as never;
}

describe("credencial gerenciada pela plataforma", () => {
  it("prefere uma credencial validada da organização sem devolver metadados", async () => {
    await expect(
      resolverCredencialGerenciada({
        db: bancoCom({ data: { id: "credencial-interna" }, error: null }),
        organizationId: "org",
        provider: "openai",
        instalacaoTemChave: true,
      }),
    ).resolves.toEqual({
      ok: true,
      credentialId: "credencial-interna",
      origem: "organizacao",
    });
  });

  it("cai na chave da instalação e falha claramente quando nenhuma existe", async () => {
    const db = bancoCom({ data: null, error: null });
    await expect(
      resolverCredencialGerenciada({
        db,
        organizationId: "org",
        provider: "openai",
        instalacaoTemChave: true,
      }),
    ).resolves.toEqual({ ok: true, credentialId: null, origem: "instalacao" });
    await expect(
      resolverCredencialGerenciada({
        db,
        organizationId: "org",
        provider: "openai",
        instalacaoTemChave: false,
      }),
    ).resolves.toEqual({ ok: false, erro: "indisponivel" });
  });

  it("projeta somente os provedores disponíveis", async () => {
    await expect(
      provedoresComCredencialGerenciada({
        db: bancoCom({ data: [{ provider: "openai" }], error: null }),
        organizationId: "org",
        provedoresDaInstalacao: ["anthropic"],
      }),
    ).resolves.toEqual(["anthropic", "openai"]);
  });
});
