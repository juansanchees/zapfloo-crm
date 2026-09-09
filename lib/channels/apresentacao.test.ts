import { describe, expect, it } from "vitest";
import { rotuloDoTipoDeConexao } from "./apresentacao";

describe("rótulo do tipo de conexão", () => {
  it("distingue claramente oficial, QR e parceiro", () => {
    expect(rotuloDoTipoDeConexao("meta_cloud")).toBe("API Oficial");
    expect(rotuloDoTipoDeConexao("waha")).toBe("Conexão por QR");
    expect(rotuloDoTipoDeConexao("zernio")).toBe("Provedor parceiro");
  });
});
