import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("engine purity guardrail", () => {
  it("passes on clean engine", () => {
    expect(() =>
      execSync("node scripts/lint-engine.mjs", { cwd: root, stdio: "pipe" })
    ).not.toThrow();
  });
});
