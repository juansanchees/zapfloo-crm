import { describe, expect, it } from "vitest";

import { diagnosticoDoEnsaio } from "./diagnostico-do-ensaio";
import { traduzir } from "@/lib/i18n/dicionario";

describe("diagnóstico acionável do ensaio", () => {
  it.each([
    [
      "credential_invalid",
      "Esta versão não tem uma chave utilizável para a empresa de IA escolhida.",
      "IA › Credenciais",
    ],
    [
      "credential_provider_mismatch",
      "A chave e o modelo desta versão pertencem a empresas de IA diferentes.",
      "IA › Agentes",
    ],
    [
      "credencial_recusada",
      "A empresa de IA recusou a chave cadastrada.",
      "IA › Credenciais",
    ],
    [
      "limite_ou_saldo",
      "A empresa de IA recusou a geração por limite de uso ou saldo.",
      "conta da empresa de IA",
    ],
  ])("%s aponta para a causa e o lugar certos", (codigo, motivo, destino) => {
    expect(diagnosticoDoEnsaio(codigo, "mensagem crua")).toEqual({ motivo, destino });
  });

  it("os novos textos têm tradução em espanhol", () => {
    for (const texto of [
      "Esta versão não tem uma chave utilizável para a empresa de IA escolhida.",
      "A chave e o modelo desta versão pertencem a empresas de IA diferentes.",
      "A empresa de IA recusou a chave cadastrada.",
      "A empresa de IA recusou a geração por limite de uso ou saldo.",
      "Próximo passo:",
      "conta da empresa de IA",
    ]) {
      expect(traduzir(texto, "es")).not.toBe(texto);
    }
  });
});
