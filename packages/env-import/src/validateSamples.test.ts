import { describe, it, expect } from "vitest";
import { validateEnvironmentSamples, assertRequiredKinds } from "./validateSamples.js";
import type { EnvironmentSampleInsert } from "./types.js";

describe("validateEnvironmentSamples", () => {
  it("accepts well-formed rows", () => {
    const rows: EnvironmentSampleInsert[] = [
      { ts: 0, kind: "sea_state_hs_m", x_km: 10, y_km: 10, depth_m: 0, value: 2.1 },
      { ts: 0, kind: "salinity_psu", x_km: 10, y_km: 10, depth_m: 0, value: 34.7 },
      { ts: 0, kind: "fog_vis_km", x_km: 10, y_km: 10, depth_m: 0, value: 12 },
    ];
    const result = validateEnvironmentSamples(rows);
    expect(result.ok).toBe(true);
    expect(assertRequiredKinds(result.byKind, ["sea_state_hs_m"])).toEqual([]);
  });

  it("rejects out-of-range salinity", () => {
    const result = validateEnvironmentSamples([
      { ts: 0, kind: "salinity_psu", x_km: 5, y_km: 5, depth_m: 0, value: 5 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.message).toContain("salinity_psu");
  });
});
