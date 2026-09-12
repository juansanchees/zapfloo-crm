import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function texto(caminho: string) {
  return readFileSync(join(root, caminho), "utf8");
}

describe("modelo comercial e matriz de papéis", () => {
  it("mantém assinatura multi-tenant como modelo principal sem apagar self-host", () => {
    for (const caminho of ["AGENTS.md", "CLAUDE.md", "VISION.md"]) {
      const conteudo = texto(caminho);
      expect(conteudo, caminho).toMatch(/assinatura/i);
      expect(conteudo, caminho).toMatch(/self-host/i);
      expect(conteudo, caminho).not.toMatch(/Monetização\s*=\s*self-host em VPS, não assinatura/i);
    }
  });

  it("não confunde administrador tenant com administrador de plataforma", () => {
    const matriz = texto("docs/business-rules/papeis-e-telas.md");

    expect(matriz).toContain("Recepcionista ou atendente");
    expect(matriz).toContain("Dona ou gerente da clínica");
    expect(matriz).toContain("administrador de plataforma");
    expect(matriz).toContain("administrador tenant de compatibilidade");
    expect(matriz).toContain("is_platform_admin");
    expect(matriz).toContain("PostgREST");
  });
});
