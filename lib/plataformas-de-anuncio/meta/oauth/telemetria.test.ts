// @vitest-environment node
/** SDK REAL, tráfego simulado por diagnostics_channel: nenhuma chamada externa. */
import { channel } from "node:diagnostics_channel";
import * as Sentry from "@sentry/nextjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { trocarEValidarCodigo } from "./cliente";
import type { ConfigOAuth } from "./config";

const config: ConfigOAuth = {
  appId: "123456", appSecret: "segredo-ficticio-telemetria", configId: "789012",
  redirectUri: "https://produto.example/api/v1/ads/meta/oauth/callback", graphVersion: "v22.0",
};
const eventos: unknown[] = [];

/** Os eventos que Undici realmente emite; não há servidor nem token real. */
function simularRespostaHttp(input: string) {
  const url = new URL(input);
  const request = { origin: url.origin, path: url.pathname + url.search, method: "GET", headers: "" };
  channel("undici:request:create").publish({ request });
  channel("undici:request:headers").publish({ request, response: { statusCode: 200, headers: [] } });
  channel("undici:request:trailers").publish({ request });
}

beforeAll(() => {
  Sentry.init({
    dsn: "https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@sentry.example/1", tracesSampleRate: 1,
    serverName: "ambiente-ficticio-de-teste",
    defaultIntegrations: false,
    integrations: [Sentry.nativeNodeFetchIntegration({ breadcrumbs: true, spans: true })],
    transport: () => ({ send: async (envelope: unknown) => { eventos.push(envelope); return { statusCode: 200 }; }, flush: async () => true }),
  });
});
afterAll(async () => { await Sentry.close(1000); });

describe("sigilo com a instrumentação real do Sentry", () => {
  it("controle positivo: HTTP comum realmente gera breadcrumb com a query", () => {
    Sentry.getIsolationScope().clearBreadcrumbs();
    Sentry.getCurrentScope().clearBreadcrumbs();
    simularRespostaHttp("https://api.example/leitura?controle=visivel");
    const breadcrumbs = [...Sentry.getCurrentScope().getScopeData().breadcrumbs, ...Sentry.getIsolationScope().getScopeData().breadcrumbs];
    expect(JSON.stringify(breadcrumbs)).toContain("controle=visivel");
  });

  it("troca e debug não criam breadcrumbs nem spans contendo segredos, mesmo após await", async () => {
    Sentry.getIsolationScope().clearBreadcrumbs();
    Sentry.getCurrentScope().clearBreadcrumbs();
    eventos.length = 0;
    const transporte = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      await Promise.resolve();
      simularRespostaHttp(String(input));
      return String(input).includes("/debug_token?")
        ? Response.json({ data: { app_id: config.appId, is_valid: true, type: "SYSTEM_USER", expires_at: 0, data_access_expires_at: 0, scopes: ["ads_read"] } })
        : Response.json({ access_token: "token-ficticio-telemetria" });
    });
    await Sentry.startSpan({ name: "pai-sem-segredos", op: "test" }, async () => {
      expect(await trocarEValidarCodigo(config, "codigo-ficticio-telemetria", new Date("2026-09-15T12:00:00Z"), transporte)).toMatchObject({ ok: true });
    });
    await Sentry.flush(1000);
    const observavel = JSON.stringify({
      eventos,
      current: Sentry.getCurrentScope().getScopeData().breadcrumbs,
      isolation: Sentry.getIsolationScope().getScopeData().breadcrumbs,
    });
    expect(transporte).toHaveBeenCalledTimes(2);
    expect(observavel).not.toContain("segredo-ficticio-telemetria");
    expect(observavel).not.toContain("codigo-ficticio-telemetria");
    expect(observavel).not.toContain("token-ficticio-telemetria");
    expect(observavel).not.toContain("/oauth/access_token");
    expect(observavel).not.toContain("/debug_token");
  });
});
