import { readFileSync } from "node:fs";
import ts from "typescript";

import { describe, expect, it } from "vitest";

const ler = (arquivo: string) => readFileSync(arquivo, "utf8");

function chamadas(arquivo: string): string[] {
  const fonte = ler(arquivo);
  const ast = ts.createSourceFile(arquivo, fonte, ts.ScriptTarget.Latest, true,
    arquivo.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const resultado: string[] = [];
  const visitar = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) resultado.push(node.expression.getText(ast));
    ts.forEachChild(node, visitar);
  };
  visitar(ast);
  return resultado;
}

const cobraInvocacao = (arquivo: string, nome: string) =>
  expect(chamadas(arquivo), arquivo).toContain(nome);

describe("bloqueio comercial nos sinks", () => {
  it("barra a saída antes de criar uma mensagem queued", () => {
    const fonte = ler("app/api/v1/messages/_handler.ts");
    const gate = fonte.indexOf("exigirAcessoComercial");
    const queued = fonte.indexOf('status: "queued"');
    expect(gate).toBeGreaterThan(-1);
    expect(queued).toBeGreaterThan(gate);
    cobraInvocacao("app/api/v1/messages/_handler.ts", "exigirAcessoComercial");
  });

  it("não consulta cobrança na ingestão e mantém o caminho inbound intacto", () => {
    for (const arquivo of [
      "app/api/v1/webhooks/waha/route.ts",
      "lib/waha/ingest.ts",
      "workers/media-persist-worker.ts",
    ]) {
      const fonte = ler(arquivo);
      expect(fonte).not.toContain("exigirAcessoComercial");
      expect(fonte).not.toContain("avaliarAcessoComercial");
    }
  });

  it("barra mídia paga antes de baixar bytes ou resolver provedor", () => {
    const fonte = ler("workers/media-derive-worker.ts");
    const gate = fonte.indexOf("exigirAcessoComercial");
    const download = fonte.indexOf('.storage.from("whatsapp-media").download');
    const credencial = fonte.indexOf("await resolveOrgLlmConfig");
    expect(gate).toBeGreaterThan(-1);
    expect(download).toBeGreaterThan(gate);
    expect(credencial).toBeGreaterThan(gate);
  });

  it("todos os sinks diretos de modelo inventariados têm guarda comercial compartilhada", () => {
    for (const arquivo of [
      "workers/ai-sentiment-worker.ts",
      "workers/ai-response-worker.ts",
      "workers/media-derive-worker.ts",
      "lib/ai/embed.ts",
      "lib/ai/runtime/agent.ts",
      "app/actions/onboarding/montarQuadro.ts",
      "lib/agent-engine/edge/llm/credentials.ts",
    ]) {
      expect(chamadas(arquivo), arquivo).toSatisfy((itens: string[]) =>
        itens.some((nome) => nome === "exigirAcessoComercial" || nome === "exigirAcessoComercialViaPg"));
    }
  });

  it("o redrive e o alerta externo também consultam a guarda antes do transporte", () => {
    cobraInvocacao("lib/agent-engine/edge/crm/session-reconciler.ts", "exigirAcessoComercialViaPg");
    cobraInvocacao("workers/handoff-owner-alert-worker.ts", "exigirAcessoComercialViaPg");
  });

  it("cobre automação, reenvio, conversão Meta, presença e o shell por invocação real", () => {
    cobraInvocacao("lib/automation/actions/call-webhook.ts", "exigirAcessoComercial");
    cobraInvocacao("app/api/v1/automation-rules/runs/[runId]/resend/route.ts", "executeCallWebhook");
    cobraInvocacao("lib/conversoes/envio.handler.ts", "exigirAcessoComercial");
    cobraInvocacao("lib/agent-engine/agent/inbound-turn.ts", "comPresencaDeDigitacao");
    cobraInvocacao("app/app/layout.tsx", "destinoComercialDoShell");
  });
});
