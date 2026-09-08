import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const instalador = readFileSync(join(process.cwd(), "hostgator-setup-kit/install.sh"), "utf8");

describe("reexecução do instalador preserva configuração de IA", () => {
  it("semeia provider/modelo só em organização nova ou ainda sem provider", () => {
    expect(instalador).toContain("v_org_criada boolean := false");
    expect(instalador).toContain("v_org_criada := true");
    expect(instalador).toMatch(
      /where o\.id = v_org\s+and \(v_org_criada or nullif\(o\.settings #>> '\{llm,provider\}', ''\) is null\)/,
    );
  });
});
