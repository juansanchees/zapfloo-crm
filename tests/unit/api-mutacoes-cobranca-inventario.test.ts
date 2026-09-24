import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const RAIZ = "app/api/v1";
const METODOS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const EXCECOES_EXATAS: Record<string, string> = {
  "app/api/v1/admin/billing/settings/route.ts": "plataforma: interruptor global restrito a platform admin full",
  "app/api/v1/admin/billing/unmatched/[id]/link/route.ts": "plataforma: conciliação manual restrita a platform admin full",
  "app/api/v1/admin/impersonate/end/route.ts": "plataforma: encerra impersonação",
  "app/api/v1/admin/incidents/[id]/resolve/route.ts": "plataforma: incidente global",
  "app/api/v1/admin/platform-admins/route.ts": "plataforma: concessão/revogação de platform admin",
  "app/api/v1/admin/tenants/[id]/impersonate/route.ts": "plataforma: impersonação",
  "app/api/v1/admin/tenants/[id]/reactivate/route.ts": "plataforma: reativação comercial",
  "app/api/v1/admin/tenants/[id]/route.ts": "plataforma: administração do tenant",
  "app/api/v1/admin/tenants/[id]/suspend/route.ts": "plataforma: suspensão do tenant",
  "app/api/v1/admin/tenants/route.ts": "plataforma: criação/administração do tenant",
  "app/api/v1/ads/meta/oauth/agency/route.ts": "externa: link assinado, uso único e rate limit",
  "app/api/v1/cron/agenda-google-push/route.ts": "interna: cron autenticado por segredo",
  "app/api/v1/cron/agenda-google-refresh/route.ts": "interna: cron autenticado por segredo",
  "app/api/v1/cron/agenda-google-sync/route.ts": "interna: cron autenticado por segredo",
  "app/api/v1/cron/agent-dispatcher/route.ts": "interna: cron autenticado por segredo",
  "app/api/v1/cron/channel-health/route.ts": "interna: cron autenticado por segredo",
  "app/api/v1/cron/contact-avatars/route.ts": "interna: cron autenticado por segredo",
  "app/api/v1/cron/contact-phones/route.ts": "interna: cron autenticado por segredo",
  "app/api/v1/cron/contact-proposals-watcher/route.ts": "interna: cron autenticado por segredo",
  "app/api/v1/cron/data-retention/route.ts": "interna: cron autenticado por segredo",
  "app/api/v1/cron/event-log-drain/route.ts": "interna: cron autenticado por segredo",
  "app/api/v1/cron/followup-flow-worker/route.ts": "interna: cron autenticado por segredo",
  "app/api/v1/cron/onboarding-sites/route.ts": "interna: cron autenticado por segredo",
  "app/api/v1/cron/recover-stuck-messages/route.ts": "interna: cron autenticado por segredo",
  "app/api/v1/cron/risk-watcher/route.ts": "interna: cron autenticado por segredo",
  "app/api/v1/cron/routing-worker/route.ts": "interna: cron autenticado por segredo",
  "app/api/v1/cron/snooze-watcher/route.ts": "interna: cron autenticado por segredo",
  "app/api/v1/cron/sync-model-catalog/route.ts": "interna: cron autenticado por segredo",
  "app/api/v1/system/agent/route.ts": "interna: agente do host autenticado por segredo",
  "app/api/v1/system/update/route.ts": "plataforma: operação do host por platform admin",
  "app/api/v1/team/[user_id]/role/route.ts": "tenant: alias delega ao _shared com requireRole",
  "app/api/v1/team/[user_id]/route.ts": "tenant: delega ao _shared com requireRole",
  "app/api/v1/webhooks/channel/[token]/route.ts": "externa inbound: token do canal",
  "app/api/v1/webhooks/in/[token]/route.ts": "externa inbound: token da fonte",
  "app/api/v1/webhooks/meta/[token]/route.ts": "externa inbound: assinatura do canal",
  "app/api/v1/webhooks/nuvemshop/[event]/route.ts": "externa inbound: assinatura Nuvemshop",
  "app/api/v1/webhooks/nuvemshop/customer-data-request/route.ts": "externa inbound: pedido LGPD assinado",
  "app/api/v1/webhooks/nuvemshop/customer-redact/route.ts": "externa inbound: pedido LGPD assinado",
  "app/api/v1/webhooks/nuvemshop/store-redact/route.ts": "externa inbound: pedido LGPD assinado",
  "app/api/v1/webhooks/waha/[token]/route.ts": "externa inbound: token e HMAC WAHA",
  "app/api/v1/webhooks/waha/route.ts": "externa inbound: HMAC WAHA",
};

function rotas(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const caminho = join(dir, item.name);
    if (item.isDirectory()) return rotas(caminho);
    return item.name === "route.ts" ? [caminho] : [];
  });
}

function analisar(arquivo: string): { mutavel: boolean; guardas: string[] } {
  const fonte = readFileSync(arquivo, "utf8");
  const ast = ts.createSourceFile(arquivo, fonte, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let mutavel = false;
  const guardas: string[] = [];
  const exportado = (node: ts.Node) => ts.canHaveModifiers(node)
    && ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) === true;
  const visitar = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && exportado(node) && node.name && METODOS.has(node.name.text)) {
      mutavel = true;
    }
    if (ts.isVariableStatement(node) && exportado(node)) {
      for (const declaracao of node.declarationList.declarations) {
        if (ts.isIdentifier(declaracao.name) && METODOS.has(declaracao.name.text)) mutavel = true;
      }
    }
    if (ts.isCallExpression(node)) {
      const nome = node.expression.getText(ast);
      if (["requireRole", "exigirAcessoComercial", "recusaComercialDaMutacao"].includes(nome)) {
        guardas.push(nome);
      }
    }
    ts.forEachChild(node, visitar);
  };
  visitar(ast);
  return { mutavel, guardas };
}

describe("inventário comercial das APIs mutáveis", () => {
  it("nenhuma mutação tenant nasce sem requireRole/gate explícito ou exceção exata justificada", () => {
    const semGuarda = rotas(RAIZ)
      .map((arquivo) => ({ arquivo: relative(".", arquivo), ...analisar(arquivo) }))
      .filter((item) => item.mutavel && item.guardas.length === 0)
      .map((item) => item.arquivo)
      .sort();

    expect(semGuarda).toEqual(Object.keys(EXCECOES_EXATAS).sort());
    expect(Object.values(EXCECOES_EXATAS).every((motivo) => motivo.length > 12)).toBe(true);
  });
});
