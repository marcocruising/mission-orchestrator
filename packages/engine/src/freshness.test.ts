import { describe, it, expect } from "vitest";
import { freshness, factConfidenceAt } from "./freshness.js";
import type { Fact, Belief } from "./types.js";
import { beliefKey, getFact, setFact } from "./types.js";

describe("freshness", () => {
  const H = 120;

  it("freshness(0) = 1", () => {
    expect(freshness(0, H)).toBe(1);
  });

  it("freshness(H) = 0.5", () => {
    expect(freshness(H, H)).toBeCloseTo(0.5, 10);
  });

  it("decays monotonically", () => {
    expect(freshness(60, H)).toBeGreaterThan(freshness(120, H));
    expect(freshness(120, H)).toBeGreaterThan(freshness(240, H));
  });
});

describe("factConfidenceAt", () => {
  it("combines stored confidence with freshness decay", () => {
    const fact: Fact = {
      asset_id: "a1",
      field: "x_km",
      value: 1,
      ts: 1000,
      source: "telemetry",
      confidence: 0.8,
      half_life_s: 120,
    };
    expect(factConfidenceAt(fact, 1000)).toBeCloseTo(0.8);
    expect(factConfidenceAt(fact, 1120)).toBeCloseTo(0.4);
  });
});

describe("Belief map", () => {
  it("keys facts by asset_id:field", () => {
    const belief: Belief = new Map();
    const fact: Fact = {
      asset_id: "uuv-1",
      field: "battery_pct",
      value: 80,
      ts: 0,
      source: "telemetry",
      confidence: 1,
      half_life_s: 120,
    };
    setFact(belief, fact);
    expect(beliefKey("uuv-1", "battery_pct")).toBe("uuv-1:battery_pct");
    expect(getFact(belief, "uuv-1", "battery_pct")).toEqual(fact);
    expect(getFact(belief, "uuv-1", "x_km")).toBeUndefined();
  });
});

describe("types compile", () => {
  it("exports domain types", () => {
    const fact: Fact = {
      asset_id: "x",
      field: "y",
      value: null,
      ts: 0,
      source: "estimate",
      confidence: 0.5,
      half_life_s: 120,
    };
    expect(fact.confidence).toBe(0.5);
  });
});
