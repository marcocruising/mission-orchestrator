import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("structural guard scripts (Phase B)", () => {
  it("rollup leaf-agnostic lint passes", () => {
    expect(() =>
      execSync("node scripts/lint-rollup-purity.mjs", { cwd: root, stdio: "pipe" })
    ).not.toThrow();
  });

  it("planner opaque-handle lint passes", () => {
    expect(() =>
      execSync("node scripts/lint-planner-purity.mjs", { cwd: root, stdio: "pipe" })
    ).not.toThrow();
  });
});
