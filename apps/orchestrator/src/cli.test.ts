import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("inspect CLI", () => {
  it("prints believed fleet without DB", () => {
    const out = execSync("node dist/cli.js inspect 1", {
      cwd: pkgRoot,
      encoding: "utf8",
      env: { ...process.env, SUPABASE_URL: "" },
    });
    expect(out).toContain("uuv-alpha");
    expect(out).toContain("usv-bravo");
  });
});
