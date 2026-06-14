import { describe, it, expect } from "vitest";
import {
  buildEnvironmentContext,
  staticEnvironmentContext,
  sampleEnvironmentContext,
  rowToEnvironmentSample,
} from "./environmentContext.js";
import { kmToM } from "./spatial.js";

describe("EnvironmentContext (T2.6)", () => {
  const pos = { x_m: 1000, y_m: 2000, z_m: -50 };

  it("staticEnvironmentContext returns defaults when no import data", () => {
    const ctx = staticEnvironmentContext(100, { salinity_psu: 35 });
    expect(ctx.sample("salinity_psu", pos)).toBe(35);
    expect(ctx.sample("fog_vis_km", pos)).toBeNull();
  });

  it("sampleEnvironmentContext returns nearest-neighbor value", () => {
    const ctx = sampleEnvironmentContext(100, [
      { ts: 100, x_m: 0, y_m: 0, z_m: 0, kind: "salinity_psu", value: 30 },
      { ts: 100, x_m: kmToM(5), y_m: 0, z_m: 0, kind: "salinity_psu", value: 40 },
    ]);
    expect(ctx.sample("salinity_psu", { x_m: 100, y_m: 0, z_m: 0 })).toBe(30);
    expect(ctx.sample("salinity_psu", { x_m: kmToM(4.9), y_m: 0, z_m: 0 })).toBe(40);
  });

  it("buildEnvironmentContext falls back to defaults when no sample matches kind", () => {
    const ctx = buildEnvironmentContext(
      100,
      [{ ts: 100, kind: "salinity_psu", x_km: 1, y_km: 0, depth_m: 0, value: 33 }],
      { fog_vis_km: 10 }
    );
    expect(ctx.sample("salinity_psu", pos)).toBe(33);
    expect(ctx.sample("fog_vis_km", pos)).toBe(10);
  });

  it("rowToEnvironmentSample converts legacy km/depth columns", () => {
    const s = rowToEnvironmentSample({
      ts: 1,
      kind: "sea_state_hs_m",
      x_km: 2,
      y_km: -1,
      depth_m: 40,
      value: 1.5,
    });
    expect(s.x_m).toBe(2000);
    expect(s.z_m).toBe(-40);
    expect(s.value).toBe(1.5);
  });
});
