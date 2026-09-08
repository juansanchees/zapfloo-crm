import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ler = (arquivo: string) => readFileSync(join(process.cwd(), arquivo), "utf8");

describe("distribuição privada Zapfloo", () => {
  it("documenta autenticação do Git e do GHCR sem token em argumento", () => {
    const docs = `${ler("README.md")}\n${ler("hostgator-setup-kit/comecar.sh")}`;
    expect(docs).toContain("gh auth login");
    expect(docs).toContain("gh repo clone juansanchees/zapfloo-crm");
    expect(docs).toContain(
      "gh auth token | docker login ghcr.io -u juansanchees --password-stdin",
    );
    expect(docs).not.toContain("raw.githubusercontent.com/melgarafael/DeskcommCRM");
  });

  it("instalador falha fechado se os pacotes privados não forem baixados", () => {
    const install = ler("hostgator-setup-kit/install.sh");
    expect(install).toContain("Não consegui baixar os pacotes privados da Zapfloo");
    expect(install).toContain("A configuração e o banco foram preservados");
  });
});
