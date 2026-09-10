// @vitest-environment node
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import {
  criarArquivoTemporarioPrivado,
  exigirCleanupCompleto,
} from "../e2e/utils/seguranca-da-prova-fresca";

const require = createRequire(import.meta.url);

function modo(path: string): number {
  return statSync(path).mode & 0o777;
}

async function executarCapturaRealDoPlaywright(protegido: boolean, segredo: string) {
  const raizPlaywright = dirname(require.resolve("playwright"));
  const fonte = readFileSync(join(raizPlaywright, "lib/index.js"), "utf8");
  const inicio = fonte.indexOf("async _takePageSnapshot(context) {");
  const fim = fonte.indexOf("\n  async didCreateRequestContext", inicio);
  expect(inicio >= 0 && fim > inicio, "o método real de snapshot do Playwright precisa continuar localizável").toBe(true);
  const corpo = fonte.slice(inicio + "async _takePageSnapshot(context) {".length, fim - 4);
  const executar = runInNewContext(`(async function(context) {${corpo}})`, {
    process: { env: protegido ? { PLAYWRIGHT_NO_COPY_PROMPT: "1" } : {} },
    debugLogger: { log: () => undefined },
  }) as (this: Record<string, unknown>, context: unknown) => Promise<void>;
  const recorder: {
    _testInfo: { errors: Array<Record<string, unknown>> };
    _pageSnapshot?: string;
  } = { _testInfo: { errors: [{}] } };
  const context = {
    pages: () => [{
      _wrapApiCall: async (acao: () => Promise<void>) => acao(),
      ariaSnapshot: async () => segredo,
    }],
  };
  await executar.call(recorder, context);
  return recorder._pageSnapshot;
}

describe("segurança da prova fresca", () => {
  it("cria diretório 0700 e arquivo 0600 e limpa o conjunto de forma idempotente", () => {
    const temporario = criarArquivoTemporarioPrivado("qr.png");
    expect(modo(temporario.diretorio)).toBe(0o700);
    expect(modo(temporario.arquivo)).toBe(0o600);
    temporario.limpar();
    expect(existsSync(temporario.diretorio)).toBe(false);
    temporario.limpar();
  });

  it("tenta todos os cleanups e falha alto sem repetir o detalhe sensível", async () => {
    const segredo = randomUUID();
    let primeira = 0;
    let segunda = 0;
    let mensagem = "";
    try {
      await exigirCleanupCompleto([
        async () => { primeira += 1; return { error: new Error(segredo) }; },
        async () => { segunda += 1; return { error: null }; },
      ]);
    } catch (erro) {
      mensagem = erro instanceof Error ? erro.message : "erro sem mensagem";
    }
    expect(primeira).toBe(1);
    expect(segunda).toBe(1);
    expect(mensagem.length > 0, "cleanup incompleto precisa falhar alto").toBe(true);
    expect(mensagem.includes(segredo), "o erro agregado não pode repetir detalhes sensíveis").toBe(false);
  });

  it("guard real do Playwright retira o snapshot DOM sensível do error-context", async () => {
    const segredo = randomUUID();
    const sabotado = await executarCapturaRealDoPlaywright(false, segredo);
    const protegido = await executarCapturaRealDoPlaywright(true, segredo);
    expect(sabotado === segredo, "controle positivo: sem o guard o método real captura o DOM").toBe(true);
    expect(protegido === undefined, "com o guard o método real não captura o DOM").toBe(true);

    const raizPlaywright = dirname(require.resolve("playwright"));
    const { buildErrorContext } = require(join(raizPlaywright, "lib/errorContext.js")) as {
      buildErrorContext: (opcoes: Record<string, unknown>) => string | undefined;
    };
    const construirErrorContext = (pageSnapshot: string | undefined) => buildErrorContext({
      titlePath: ["sonda neutra"],
      location: { file: import.meta.filename, line: 1, column: 1 },
      errors: [new Error("falha controlada")],
      pageSnapshot,
    });
    const errorContextSabotado = construirErrorContext(sabotado);
    const errorContextProtegido = construirErrorContext(protegido);
    expect(errorContextSabotado?.includes(segredo) === true, "controle positivo precisa vazar sem o guard").toBe(true);
    expect(typeof errorContextProtegido === "string", "error-context pode continuar existindo sem snapshot DOM").toBe(true);
    expect(errorContextProtegido?.includes(segredo) === true, "o segredo runtime não pode entrar no error-context").toBe(false);
  });
});
