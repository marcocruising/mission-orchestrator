import { describe, it, expect } from "vitest";
import { fogVisMult, salinityMult, seaStateMult } from "./curves.js";

describe("env factor curves (D1)", () => {
  it("salinityMult is 1 at reference PSU and degrades with deviation", () => {
    expect(salinityMult(35)).toBe(1);
    expect(salinityMult(null)).toBe(1);
    expect(salinityMult(35)).toBeGreaterThan(salinityMult(28)!);
    expect(salinityMult(28)).toBeLessThan(1);
  });

  it("seaStateMult degrades monotonically with Hs", () => {
    expect(seaStateMult(0)).toBe(1);
    expect(seaStateMult(null)).toBe(1);
    expect(seaStateMult(1)).toBeGreaterThan(seaStateMult(3)!);
    expect(seaStateMult(3)).toBeLessThan(1);
  });

  it("fogVisMult is 1 above reference visibility", () => {
    expect(fogVisMult(15)).toBe(1);
    expect(fogVisMult(10)).toBe(1);
    expect(fogVisMult(5)).toBeCloseTo(0.5, 5);
    expect(fogVisMult(null)).toBe(1);
  });
});
