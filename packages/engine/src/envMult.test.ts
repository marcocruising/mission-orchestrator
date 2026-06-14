import { describe, it, expect } from "vitest";
import {
  envMult,
  motionEnvFactor,
  DEFAULT_ENV_FACTORS,
  type EnvMultContext,
} from "./envMult.js";
import { envMultMotion } from "./envMult.js";
import { staticEnvironmentContext } from "./environmentContext.js";
import { effectiveQuality, slantRangeKm, type SensorSpec, type VehicleState } from "./coverage.js";

const passiveAcoustic: SensorSpec = {
  sensor: "passive_acoustic",
  base_quality: 0.9,
  max_range_km: 10,
  k_motion: 1.6,
};

const ctx = (overrides: Partial<VehicleState> = {}): EnvMultContext => ({
  sensor: passiveAcoustic,
  vehicle: {
    asset_id: "v1",
    x_km: 0,
    y_km: 0,
    depth_m: 50,
    speed_kn: 4,
    top_speed_kn: 8,
    ...overrides,
  },
});

describe("envMult (A0.2 — product over extensible factor list)", () => {
  it("single motion factor matches legacy envMultMotion formula", () => {
    const c = ctx({ speed_kn: 4, top_speed_kn: 8 });
    const fromFactors = envMult([motionEnvFactor], c);
    const legacy = envMultMotion(c.sensor.k_motion, c.vehicle.speed_kn, c.vehicle.top_speed_kn);
    expect(fromFactors).toBeCloseTo(legacy, 10);
    expect(fromFactors).toBeCloseTo(Math.exp(-1.6 * 0.5), 10);
  });

  it("motion factor at zero speed is exactly 1", () => {
    const c = ctx({ speed_kn: 0, top_speed_kn: 8 });
    expect(envMult([motionEnvFactor], c)).toBe(1);
  });

  it("stub factor returning 1.0 is a no-op on the product", () => {
    const c = ctx({ speed_kn: 6, top_speed_kn: 8 });
    const baseline = envMult([motionEnvFactor], c);
    const withStub = envMult([motionEnvFactor, () => 1], c);
    expect(withStub).toBeCloseTo(baseline, 12);
  });

  it("factor returning 0.5 scales the product by exactly half", () => {
    const c = ctx({ speed_kn: 2, top_speed_kn: 8 });
    const baseline = envMult([motionEnvFactor], c);
    const halved = envMult([motionEnvFactor, () => 0.5], c);
    expect(halved).toBeCloseTo(baseline * 0.5, 12);
  });

  it("empty factor list returns multiplicative identity 1", () => {
    expect(envMult([], ctx())).toBe(1);
  });

  it("DEFAULT_ENV_FACTORS preserves motion-only behavior", () => {
    const c = ctx({ speed_kn: 7, top_speed_kn: 8 });
    expect(envMult(DEFAULT_ENV_FACTORS, c)).toBeCloseTo(
      envMultMotion(1.6, 7, 8),
      12
    );
  });
});

describe("effectiveQuality uses envMult factor list (A0.2 regression)", () => {
  const target = { target_x: 2, target_y: 0, target_depth_m: 0 };
  const vehicle: VehicleState = {
    asset_id: "v1",
    x_km: 0,
    y_km: 0,
    depth_m: 50,
    speed_kn: 4,
    top_speed_kn: 8,
  };

  it("default factors yield same quality as pre-refactor formula for a fixed fixture", () => {
    const q = effectiveQuality(passiveAcoustic, target, vehicle);
    const R = slantRangeKm(vehicle, target);
    const rangeMult = Math.pow(1 - R / 10, 0.5);
    const motion = Math.exp(-1.6 * (4 / 8));
    const expected = passiveAcoustic.base_quality * rangeMult * motion;
    expect(q as number).toBeCloseTo(expected, 10);
  });

  it("injecting stub factor 1.0 does not change effectiveQuality", () => {
    const baseline = effectiveQuality(passiveAcoustic, target, vehicle);
    const withStub = effectiveQuality(passiveAcoustic, target, vehicle, 0.5, [
      motionEnvFactor,
      () => 1,
    ]);
    expect(withStub as number).toBeCloseTo(baseline as number, 12);
  });

  it("injecting degrading factor lowers quality proportionally", () => {
    const baseline = effectiveQuality(passiveAcoustic, target, vehicle) as number;
    const degraded = effectiveQuality(passiveAcoustic, target, vehicle, 0.5, [
      motionEnvFactor,
      () => 0.6,
    ]) as number;
    expect(degraded).toBeCloseTo(baseline * 0.6, 10);
    expect(degraded).toBeLessThan(baseline);
  });

  it("slower speed still beats faster speed with default factors (monotonicity preserved)", () => {
    const slow = effectiveQuality(passiveAcoustic, target, { ...vehicle, speed_kn: 1 });
    const fast = effectiveQuality(passiveAcoustic, target, { ...vehicle, speed_kn: 7 });
    expect(slow as number).toBeGreaterThan(fast as number);
  });

  it("environment context is plumbed through effectiveQuality (A2 seam)", () => {
    const env = staticEnvironmentContext(100, { salinity_psu: 35 });
    const withEnv = effectiveQuality(passiveAcoustic, target, vehicle, 0.5, DEFAULT_ENV_FACTORS, env);
    const baseline = effectiveQuality(passiveAcoustic, target, vehicle);
    expect(withEnv as number).toBeCloseTo(baseline as number, 10);
  });
});
