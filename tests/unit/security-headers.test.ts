import { describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs/config", () => ({
  withSentryConfig: <T>(config: T) => config,
}));

describe("cabeçalhos de segurança", () => {
  it("instrui navegadores a manter o domínio em HTTPS por um ano", async () => {
    const { default: nextConfig } = await import("../../next.config");
    expect(typeof nextConfig.headers).toBe("function");

    const rules = await nextConfig.headers!();
    const global = rules.find((rule) => rule.source === "/(.*)");

    expect(global?.headers).toContainEqual({
      key: "Strict-Transport-Security",
      value: "max-age=31536000",
    });
  });
});
