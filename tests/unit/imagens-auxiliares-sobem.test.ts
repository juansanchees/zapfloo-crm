import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  join(process.cwd(), ".github/workflows/publish-image.yml"),
  "utf8",
);

describe("gate executável das imagens auxiliares", () => {
  it("inicia worker e scheduler, não apenas constrói", () => {
    expect(workflow).toContain("imagens-auxiliares-sobem:");
    expect(workflow).toContain("zapfloo-worker-smoke:pr");
    expect(workflow).toContain("zapfloo-scheduler-smoke:pr");
    expect(workflow).toContain("ERR_PACKAGE_PATH_NOT_EXPORTED");
    expect(workflow).toContain("pgrep crond");
  });

  it("o check de fachada depende do smoke das auxiliares", () => {
    expect(workflow).toMatch(
      /imagens-ok:[\s\S]*needs: \[build-and-push, imagem-do-app-sobe, imagens-auxiliares-sobem\]/,
    );
    expect(workflow).toContain('needs.imagens-auxiliares-sobem.result');
  });
});
