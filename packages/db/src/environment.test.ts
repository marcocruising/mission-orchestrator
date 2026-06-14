import { describe, it, expect } from "vitest";
import { buildEnvironmentContext, staticEnvironmentContext } from "@mission-orchestrator/engine";

describe("loadEnvironmentContext (db adapter shape)", () => {
  it("buildEnvironmentContext matches engine nearest-neighbor + defaults", () => {
    const ctx = buildEnvironmentContext(
      100,
      [{ ts: 100, kind: "salinity_psu", x_km: 0, y_km: 0, depth_m: 0, value: 35 }],
      { fog_vis_km: 8 }
    );
    expect(ctx.sample("salinity_psu", { x_m: 100, y_m: 0, z_m: 0 })).toBe(35);
    expect(ctx.sample("fog_vis_km", { x_m: 0, y_m: 0, z_m: 0 })).toBe(8);
  });

  it("static fallback when no rows", () => {
    const ctx = staticEnvironmentContext(50, { wind_ms: 12 });
    expect(ctx.ts).toBe(50);
    expect(ctx.sample("wind_ms", { x_m: 0, y_m: 0, z_m: 0 })).toBe(12);
  });
});
