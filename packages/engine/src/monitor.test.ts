import { describe, it, expect } from "vitest";
import { scanBelief, shouldAlert, attachMissionToDisruptions } from "./monitor.js";
import { summarize } from "./summarize.js";
import type { Belief } from "./types.js";
import { setFact } from "./types.js";

describe("Monitor", () => {
  it("fires on stale belief without scripted inject", () => {
    const belief: Belief = new Map();
    setFact(belief, {
      asset_id: "uuv-1",
      field: "x_km",
      value: 0,
      ts: 0,
      source: "telemetry",
      confidence: 0.5,
      half_life_s: 120,
    });
    setFact(belief, {
      asset_id: "uuv-1",
      field: "battery_pct",
      value: 10,
      ts: 500,
      source: "telemetry",
      confidence: 1,
      half_life_s: 120,
    });
    const disruptions = scanBelief(belief, 600);
    expect(disruptions.some((d) => d.kind === "freshness_floor")).toBe(true);
    expect(disruptions.some((d) => d.kind === "battery_reserve")).toBe(true);
  });

  it("salience gate distinguishes show vs log", () => {
    expect(shouldAlert(0.5, 0.4)).toBe(true);
    expect(shouldAlert(0.2, 0.4)).toBe(false);
  });

  it("summarize produces alert text from mission state row", () => {
    const text = summarize({
      mission_id: "m1",
      tier: "AT_RISK",
      cov_now: 0.4,
      cov_baseline: 0.9,
      impact: 0.45,
      salience: 0.5,
    });
    expect(text).toContain("Mission m1");
    expect(text).toContain("tier AT_RISK");
    expect(text).toContain("coverage 40%");
  });

  it("attaches mission ids to disruptions", () => {
    const d = attachMissionToDisruptions(
      [{ id: "d1", mission_id: "", asset_id: "uuv-1", kind: "comms_loss", detail: "" }],
      new Map([["uuv-1", "m1"]])
    );
    expect(d[0]!.mission_id).toBe("m1");
  });
});
