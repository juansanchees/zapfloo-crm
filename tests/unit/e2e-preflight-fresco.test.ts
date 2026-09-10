import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect as playwrightExpect } from "@playwright/test";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const TABELAS_DO_PREFLIGHT = [
  "ai_agents",
  "ai_agent_versions",
  "ai_provider_credentials",
  "channel_sessions",
  "onboarding_drafts",
] as const;

function nomeDoNo(no: ts.PropertyName): string | null {
  return ts.isIdentifier(no) || ts.isStringLiteral(no) ? no.text : null;
}

function colunasDaRow(source: ts.SourceFile, tabela: string): Set<string> {
  let colunas: Set<string> | undefined;
  function visitar(no: ts.Node): void {
    if (ts.isPropertySignature(no) && nomeDoNo(no.name) === tabela && no.type && ts.isTypeLiteralNode(no.type)) {
      const row = no.type.members.find(
        (membro): membro is ts.PropertySignature => ts.isPropertySignature(membro) && nomeDoNo(membro.name) === "Row",
      );
      if (row?.type && ts.isTypeLiteralNode(row.type)) {
        colunas = new Set(row.type.members.flatMap((membro) => {
          if (!ts.isPropertySignature(membro)) return [];
          const nome = nomeDoNo(membro.name);
          return nome ? [nome] : [];
        }));
      }
    }
    ts.forEachChild(no, visitar);
  }
  visitar(source);
  if (!colunas) throw new Error(`Row tipada não encontrada para ${tabela}`);
  return colunas;
}

function consultaDoPreflight(source: ts.SourceFile): { tabelas: string[]; coluna: string } {
  let encontrada: { tabelas: string[]; coluna: string } | undefined;
  function visitar(no: ts.Node): void {
    if (ts.isForOfStatement(no) && ts.isAsExpression(no.expression) && ts.isArrayLiteralExpression(no.expression.expression)) {
      const tabelas = no.expression.expression.elements.flatMap((elemento) => (
        ts.isStringLiteral(elemento) ? [elemento.text] : []
      ));
      if (tabelas.includes("onboarding_drafts")) {
        function acharSelect(filho: ts.Node): void {
          const primeiraColuna = ts.isCallExpression(filho) ? filho.arguments[0] : undefined;
          if (
            ts.isCallExpression(filho)
            && ts.isPropertyAccessExpression(filho.expression)
            && filho.expression.name.text === "select"
            && primeiraColuna
            && ts.isStringLiteral(primeiraColuna)
          ) {
            encontrada = { tabelas, coluna: primeiraColuna.text };
          }
          ts.forEachChild(filho, acharSelect);
        }
        acharSelect(no.statement);
      }
    }
    ts.forEachChild(no, visitar);
  }
  visitar(source);
  if (!encontrada) throw new Error("consulta de tabelas vazias não encontrada na fresh");
  return encontrada;
}

function matchersQueSerializamRegistrosNoPreflight(source: ts.SourceFile): string[] {
  const inicio = source.text.indexOf("const usuarios =");
  const fim = source.text.indexOf("await login(page);");
  if (inicio < 0 || fim < 0 || fim <= inicio) throw new Error("limites do preflight não encontrados na fresh");

  const proibidos = new Set(["toEqual", "toHaveLength", "toMatchObject"]);
  const encontrados: string[] = [];
  function visitar(no: ts.Node): void {
    if (
      no.getStart(source) >= inicio
      && no.getEnd() <= fim
      && ts.isCallExpression(no)
      && ts.isPropertyAccessExpression(no.expression)
      && proibidos.has(no.expression.name.text)
    ) {
      encontrados.push(no.expression.name.text);
    }
    ts.forEachChild(no, visitar);
  }
  visitar(source);
  return encontrados;
}

function mensagemDaFalha(executar: () => void): string {
  try {
    executar();
  } catch (erro) {
    return erro instanceof Error ? erro.message : String(erro);
  }
  throw new Error("a asserção deveria falhar");
}

describe("preflight da instalação fresca", () => {
  it("seleciona uma coluna existente nas cinco tabelas contadas por HEAD", () => {
    const spec = ts.createSourceFile(
      "vps-fresh-onboarding.spec.ts",
      readFileSync(resolve("tests/e2e/vps-fresh-onboarding.spec.ts"), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const tipos = ts.createSourceFile(
      "database.types.ts",
      readFileSync(resolve("lib/database.types.ts"), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const consulta = consultaDoPreflight(spec);

    expect(consulta.tabelas).toEqual(TABELAS_DO_PREFLIGHT);
    expect(consulta.coluna).toBe("organization_id");
    expect(TABELAS_DO_PREFLIGHT.every((tabela) => colunasDaRow(tipos, tabela).has(consulta.coluna))).toBe(true);
  });

  it("não entrega registros pessoais aos matchers do preflight", () => {
    const spec = ts.createSourceFile(
      "vps-fresh-onboarding.spec.ts",
      readFileSync(resolve("tests/e2e/vps-fresh-onboarding.spec.ts"), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    expect(matchersQueSerializamRegistrosNoPreflight(spec)).toEqual([]);
  });

  it("o erro do matcher seguro da versão instalada não inclui o marcador sensível", () => {
    const marcadorSensivel = "email-ficticio-nao-pode-vazar@example.invalid";
    const registros = [{ email: marcadorSensivel }];
    const mensagem = mensagemDaFalha(() => {
      playwrightExpect(registros.length === 0, "o preflight precisa começar sem registros").toBe(true);
    });

    expect(mensagem).toContain("o preflight precisa começar sem registros");
    expect(mensagem).not.toContain(marcadorSensivel);
  });
});
