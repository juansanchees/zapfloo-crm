import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ler = (arquivo: string) => readFileSync(join(process.cwd(), arquivo), "utf8");

describe("documentos legais públicos", () => {
  it("instalador sempre publica um contato para pedidos de privacidade", () => {
    const install = ler("hostgator-setup-kit/install.sh");
    expect(install).toContain(
      'LGPD_DPO_EMAIL="${LGPD_DPO_EMAIL:-${SUPPORT_EMAIL:-$OWNER_EMAIL}}"',
    );
    expect(install).toContain('envq LGPD_DPO_EMAIL "$LGPD_DPO_EMAIL"');
  });

  it("política não afirma que MFA opcional é obrigatório", () => {
    const privacy = ler("app/legal/privacy/page.tsx");
    expect(privacy).not.toContain("verificação em duas etapas obrigatória para administradores");
    expect(privacy).toContain("verificação em duas etapas quando ativada");
  });
});
