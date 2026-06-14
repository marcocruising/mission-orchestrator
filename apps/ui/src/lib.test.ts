import { describe, it, expect } from "vitest";
import { searchEllipseSemiMajor, tierColor } from "./lib.js";

describe("ui helpers", () => {
  it("search ellipse grows with staleness", () => {
    expect(searchEllipseSemiMajor(10, 7200, 0)).toBeGreaterThan(searchEllipseSemiMajor(10, 3600, 0));
  });

  it("tier colors map", () => {
    expect(tierColor("FULL")).toBe("#22c55e");
    expect(tierColor("LOST")).toBe("#ef4444");
  });
});
