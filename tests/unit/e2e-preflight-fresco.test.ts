import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
});
