import { describe, it, expect } from "vitest";
import { reconcile } from "./reconcile.js";
import type { Fact } from "./types.js";

function fact(partial: Partial<Fact> & Pick<Fact, "asset_id" | "field" | "value" | "ts">): Fact {
  return {
    source: "telemetry",
    confidence: 1,
    half_life_s: 120,
    ...partial,
  };
}

describe("reconcile (A0.1 — v1: newer timestamp wins, confidence passthrough)", () => {
  it("returns incoming unchanged when no existing fact", () => {
    const incoming = fact({
      asset_id: "uuv-1",
      field: "x_km",
      value: 42,
      ts: 100,
      confidence: 0.8,
      half_life_s: 90,
    });
    const result = reconcile(undefined, incoming);
    expect(result).toEqual(incoming);
  });

  it("keeps existing when its timestamp is strictly newer", () => {
    const existing = fact({
      asset_id: "uuv-1",
      field: "x_km",
      value: 10,
      ts: 200,
      confidence: 0.9,
    });
    const incoming = fact({
      asset_id: "uuv-1",
      field: "x_km",
      value: 99,
      ts: 150,
      confidence: 0.3,
    });
    const result = reconcile(existing, incoming);
    expect(result.value).toBe(10);
    expect(result.confidence).toBe(0.9);
    expect(result.ts).toBe(200);
  });

  it("accepts incoming when its timestamp is strictly newer", () => {
    const existing = fact({
      asset_id: "uuv-1",
      field: "x_km",
      value: 10,
      ts: 100,
      confidence: 0.9,
    });
    const incoming = fact({
      asset_id: "uuv-1",
      field: "x_km",
      value: 99,
      ts: 150,
      confidence: 0.3,
    });
    const result = reconcile(existing, incoming);
    expect(result.value).toBe(99);
    expect(result.confidence).toBe(0.3);
    expect(result.ts).toBe(150);
  });

  it("does not blend confidence on conflict — winner keeps its own confidence", () => {
    const stale = fact({
      asset_id: "a",
      field: "battery_pct",
      value: 80,
      ts: 10,
      confidence: 1,
    });
    const fresh = fact({
      asset_id: "a",
      field: "battery_pct",
      value: 15,
      ts: 20,
      confidence: 0.6,
    });
    const result = reconcile(stale, fresh);
    expect(result.value).toBe(15);
    expect(result.confidence).toBe(0.6);
    expect(result.confidence).not.toBeCloseTo(0.8);
  });

  it("conflicting values always resolve by timestamp, regardless of call order", () => {
    const older = fact({ asset_id: "a", field: "x_km", value: 0, ts: 1, confidence: 1 });
    const newer = fact({ asset_id: "a", field: "x_km", value: 1000, ts: 2, confidence: 0.5 });
    expect(reconcile(older, newer).value).toBe(1000);
    expect(reconcile(newer, older).value).toBe(1000);
  });

  it("equal timestamps prefer incoming for stable ingest processing order", () => {
    const existing = fact({
      asset_id: "a",
      field: "y_km",
      value: 1,
      ts: 50,
      confidence: 0.7,
    });
    const incoming = fact({
      asset_id: "a",
      field: "y_km",
      value: 2,
      ts: 50,
      confidence: 0.4,
    });
    const result = reconcile(existing, incoming);
    expect(result.value).toBe(2);
    expect(result.confidence).toBe(0.4);
  });
});
