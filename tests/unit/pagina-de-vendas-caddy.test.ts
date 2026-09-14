import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { isPublicPath } from "@/lib/auth/public-paths";

const raiz = process.cwd();
const ler = (arquivo: string) => readFileSync(join(raiz, arquivo), "utf8");

describe("domínio opcional da página de vendas", () => {
  it("deixa /vendas público sem abrir as APIs do CRM", () => {
    expect(isPublicPath("/vendas")).toBe(true);
    expect(isPublicPath("/vendas/qualquer-coisa")).toBe(false);
  });

  it("usa hosts HTTP locais quando a instalação não configurou domínio de vendas", () => {
    const caddy = ler("Caddyfile");
    expect(caddy).toContain("{$SALES_DOMAIN:http://localhost}");
    expect(caddy).toContain("{$SALES_WWW_DOMAIN:http://www.localhost}");
    expect(caddy).toContain("redir {$SALES_DOMAIN:http://localhost}{uri} permanent");
  });

  it("publica no domínio de vendas somente a página, assets e documentos legais", () => {
    const caddy = ler("Caddyfile");
    expect(caddy).toContain("@publico path /vendas /_next/* /icon /manifest.webmanifest /legal/*");
    expect(caddy).toMatch(/reverse_proxy @publico app:3000\s+respond 404/);
  });
});
