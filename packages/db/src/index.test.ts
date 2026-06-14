import { describe, it, expect } from "vitest";

describe("db package", () => {
  it("exports client helpers", async () => {
    const mod = await import("./index.js");
    expect(mod.createServiceClient).toBeDefined();
    expect(mod.loadBelief).toBeDefined();
  });
});
