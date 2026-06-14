import { describe, it, expect } from "vitest";
import {
  ownAssetSearchRegion,
  ownAssetSearchUncertainty,
  searchEllipseSemiMajor,
} from "./searchRegion.js";
import { depthMToZM } from "./spatial.js";

describe("ownAssetSearchUncertainty (6D reachable set)", () => {
  it("returns horizontal ellipse and z uncertainty from cv6 covariance", () => {
    const u = ownAssetSearchUncertainty(3, 4, depthMToZM(50), 10, 7200, 0);
    expect(u.region.center).toEqual({ x_km: 3, y_km: 4 });
    expect(u.region.semiMajor).toBeGreaterThan(u.region.semiMinor);
    expect(u.z_m).toBe(-50);
    expect(u.z_sigma_m).toBeGreaterThan(0);
  });

  it("horizontal semiMajor grows with staleness (v_max·Δt)", () => {
    const fresh = ownAssetSearchUncertainty(0, 0, 0, 10, 3600, 0);
    const stale = ownAssetSearchUncertainty(0, 0, 0, 10, 7200, 0);
    expect(stale.region.semiMajor).toBeGreaterThan(fresh.region.semiMajor);
    expect(searchEllipseSemiMajor(10, 7200, 0)).toBeCloseTo(stale.region.semiMajor, 6);
  });

  it("z_sigma_m grows with staleness", () => {
    const fresh = ownAssetSearchUncertainty(0, 0, 100, 10, 3600, 0);
    const stale = ownAssetSearchUncertainty(0, 0, 100, 10, 7200, 0);
    expect(stale.z_sigma_m).toBeGreaterThan(fresh.z_sigma_m);
  });

  it("ownAssetSearchRegion returns horizontal projection only (backward compat)", () => {
    const region = ownAssetSearchRegion(1, 0, depthMToZM(25), 8, 7200, 0);
    const full = ownAssetSearchUncertainty(1, 0, depthMToZM(25), 8, 7200, 0);
    expect(region).toEqual(full.region);
  });

  it("preserves 0.4 minor/major aspect ratio on horizontal ellipse", () => {
    const u = ownAssetSearchUncertainty(0, 0, 0, 10, 7200, 0);
    expect(u.region.semiMinor / u.region.semiMajor).toBeCloseTo(0.4, 6);
  });
});
