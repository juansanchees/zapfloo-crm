// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { resolverPlanoIdDoPostback } from "./plano-do-postback";

const fixture = readFileSync(
  join(process.cwd(), "tests/fixtures/monetizze/postback-finalizada-aprovada.urlencoded"),
  "utf8",
).trim();

const referencias = {
  basico: "CY386459",
  essencial: "FW386460",
  completo: "VM386461",
} as const;

describe("plano contratado no postback Monetizze", () => {
  it.each([
    ["CY386459", "basico"],
    ["FW386460", "essencial"],
    ["VM386461", "completo"],
  ] as const)(
    "mapeia a referência %s para %s mesmo quando o produto e o nome são iguais",
    (referencia, planoEsperado) => {
      const postback = new URLSearchParams(fixture);
      postback.set("produto[codigo]", "produto-unico-zapfloo");
      postback.set("produto[nome]", "ZapFloo");
      postback.set("plano[nome]", "Mensal");
      postback.set("plano[referencia]", referencia);

      expect(resolverPlanoIdDoPostback(postback, referencias)).toBe(planoEsperado);
    },
  );

  it("não adivinha pelo produto ou pelo nome quando a referência do plano é desconhecida", () => {
    const postback = new URLSearchParams(fixture);
    postback.set("produto[codigo]", "produto-unico-zapfloo");
    postback.set("produto[nome]", "ZapFloo");
    postback.set("plano[nome]", "Básico");
    postback.set("plano[referencia]", "PLANO-DESCONHECIDO");

    expect(resolverPlanoIdDoPostback(postback, referencias)).toBeNull();
  });
});
