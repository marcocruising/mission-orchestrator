import { describe, it, expect } from "vitest";
import {
  covToEllipse,
  createInitialEstimate,
  deserializeEstimate,
  isPositiveDefinite,
  migrateEstimate,
  serializeEstimate,
  traceCov,
  zUncertainty,
  DEFAULT_Z_SIGMA_M,
  ESTIMATE_STATE_DIM,
} from "./estimate.js";
import { StateLayout, kmToM } from "./spatial.js";

describe("Estimate (T2.1 cv6)", () => {
  it("createInitialEstimate uses diagonal position σ²·I with zero velocity (SI meters)", () => {
    const est = createInitialEstimate(kmToM(3), kmToM(-2), -40, 100, 500);
    expect(est.layout).toBe("cv6");
    expect(est.mean).toEqual([3000, -2000, -40, 0, 0, 0]);
    expect(est.cov[StateLayout.X][StateLayout.X]).toBe(250_000);
    expect(est.cov[StateLayout.Y][StateLayout.Y]).toBe(250_000);
    expect(est.cov[StateLayout.Z][StateLayout.Z]).toBe(250_000);
    expect(est.cov[StateLayout.X][StateLayout.Y]).toBe(0);
    expect(est.cov[StateLayout.VX][StateLayout.VX]).toBe(1e-6);
    expect(est.ts).toBe(100);
    expect(est.mean.length).toBe(ESTIMATE_STATE_DIM);
  });

  it("zUncertainty reads Z mean and σ from cov[Z,Z]", () => {
    const est = createInitialEstimate(0, 0, -50, 0, 100, 200);
    const zu = zUncertainty(est.mean, est.cov);
    expect(zu.z_m).toBe(-50);
    expect(zu.sigma_m).toBeCloseTo(200, 6);
  });

  it("migrateEstimate upgrades legacy 4D km state with large z variance", () => {
    const legacy = {
      mean: [1.5, -0.5, 0, 0],
      cov: [
        [0.09, 0, 0, 0],
        [0, 0.09, 0, 0],
        [0, 0, 1e-6, 0],
        [0, 0, 0, 1e-6],
      ],
      ts: 42,
    };
    const migrated = migrateEstimate(legacy);
    expect(migrated.layout).toBe("cv6");
    expect(migrated.mean[StateLayout.X]).toBeCloseTo(1500, 6);
    expect(migrated.mean[StateLayout.Y]).toBeCloseTo(-500, 6);
    expect(migrated.cov[StateLayout.Z][StateLayout.Z]).toBe(DEFAULT_Z_SIGMA_M ** 2);
    expect(zUncertainty(migrated.mean, migrated.cov).sigma_m).toBeCloseTo(DEFAULT_Z_SIGMA_M, 6);
  });

  it("deserializeEstimate migrates legacy JSON without layout field", () => {
    const legacyJson = JSON.stringify({
      mean: [0, 0, 0, 0],
      cov: [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1e-6, 0],
        [0, 0, 0, 1e-6],
      ],
      ts: 1,
    });
    const est = deserializeEstimate(legacyJson);
    expect(est.layout).toBe("cv6");
    expect(est.mean.length).toBe(6);
  });

  it("isPositiveDefinite accepts valid covariance and rejects non-PD", () => {
    expect(isPositiveDefinite(createInitialEstimate(0, 0, 0, 0).cov)).toBe(true);
    expect(
      isPositiveDefinite([
        [1, 2],
        [2, 1],
      ])
    ).toBe(false);
  });

  it("covToEllipse maps isotropic position uncertainty to a circle (semiMajor ≈ semiMinor)", () => {
    const est = createInitialEstimate(0, 0, 0, 0, kmToM(1));
    const region = covToEllipse(est.cov, est.mean, 2);
    expect(region.center).toEqual({ x_km: 0, y_km: 0 });
    expect(region.semiMajor).toBeCloseTo(2, 6);
    expect(region.semiMinor).toBeCloseTo(2, 6);
    expect(region.angleRad).toBeCloseTo(0, 6);
  });

  it("covToEllipse extracts anisotropic ellipse geometry from off-diagonal cov (m → km)", () => {
    const cov = Array.from({ length: 6 }, () => Array(6).fill(0));
    cov[0][0] = kmToM(2) ** 2;
    cov[1][1] = kmToM(1) ** 2;
    const region = covToEllipse(cov, [kmToM(5), kmToM(6), 0, 0, 0, 0], 2);
    expect(region.semiMajor).toBeCloseTo(4, 6);
    expect(region.semiMinor).toBeCloseTo(2, 6);
    expect(region.center).toEqual({ x_km: 5, y_km: 6 });
  });

  it("serialize/deserialize round-trip preserves cv6 matrix exactly", () => {
    const est = createInitialEstimate(kmToM(1.5), kmToM(-0.5), 0, 42, 300);
    est.cov[0][1] = 100;
    est.cov[1][0] = 100;
    const restored = deserializeEstimate(serializeEstimate(est));
    expect(restored).toEqual(est);
  });

  it("traceCov sums diagonal for sanity checks in estimator tests", () => {
    const est = createInitialEstimate(0, 0, 0, 0, 2000);
    expect(traceCov(est.cov)).toBeCloseTo(2 * 2000 ** 2 + 500 ** 2 + 3 * 1e-6, 0);
  });
});
