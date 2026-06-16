import { describe, it, expect } from "vitest";
import { buildSampleGrid, tickToEpochS } from "./sampleGrid.js";
import type { ScenarioEnvConfig } from "./types.js";

const config: ScenarioEnvConfig = {
  geo: { origin_lat: 56.5, origin_lon: 1.0 },
  reference_iso: "2026-06-15T12:00:00Z",
  tick_duration_s: 3600,
  bounds_km: { min: 0, max: 20 },
  grid_step_km: 10,
  depths_m: [0, 60],
};

describe("sampleGrid", () => {
  it("builds a regular grid including corners", () => {
    const grid = buildSampleGrid(config);
    expect(grid).toHaveLength(9);
    expect(grid.some((p) => p.x_km === 0 && p.y_km === 0)).toBe(true);
    expect(grid.some((p) => p.x_km === 20 && p.y_km === 20)).toBe(true);
  });

  it("advances epoch by tick duration", () => {
    const t0 = tickToEpochS(config, 0);
    const t1 = tickToEpochS(config, 1);
    expect(t1 - t0).toBe(3600);
  });
});
