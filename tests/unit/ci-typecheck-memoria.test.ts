import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("memória do typecheck no CI", () => {
  it("o job verify amplia o heap antes de executar o TypeScript", () => {
    const workflow = readFileSync(
      join(process.cwd(), ".github/workflows/ci.yml"),
      "utf8",
    );
    const verify = workflow.match(/\n  verify:\n([\s\S]*?)\n  invariants:/)?.[1] ?? "";

    expect(verify).toContain("NODE_OPTIONS: --max-old-space-size=4096");
    expect(verify.indexOf("NODE_OPTIONS:")).toBeLessThan(verify.indexOf("pnpm typecheck"));
  });
});
