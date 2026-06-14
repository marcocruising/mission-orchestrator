import { describe, it, expect } from "vitest";
import { createInitialEstimate, traceCov } from "./estimate.js";
import {
  horizontalBearingMeasurement,
  position3Measurement,
  positionMeasurement,
  kalmanUpdate,
} from "./measurement.js";
import { StateLayout } from "./spatial.js";

describe("Measurement (T2.2)", () => {
  it("positionMeasurement uses h(state)=[x_m,y_m] and diagonal R in meters", () => {
    const m = positionMeasurement([10000, 20000], 500, 100, { x_km: 0, y_km: 0 }, "obs-1", "radar");
    expect(m.h([10000, 20000, 0, 0, 0, 0])).toEqual([10000, 20000]);
    expect(m.R[0][0]).toBe(250_000);
    expect(m.sensor).toBe("radar");
  });

  it("position3Measurement pulls z via h(state)=[x_m,y_m,z_m]", () => {
    const m = position3Measurement([1000, 2000, -50], 100, 1, { x_km: 0, y_km: 0 }, "obs", "sonar");
    expect(m.h([0, 0, 0, 0, 0, 0])).toEqual([0, 0, 0]);
    const est = createInitialEstimate(0, 0, 0, 0, 3000, 3000);
    const updated = kalmanUpdate(est, m);
    expect(updated.mean[StateLayout.Z]).toBeLessThan(0);
  });

  it("horizontalBearingMeasurement uses atan2 observation model in horizontal plane", () => {
    const m = horizontalBearingMeasurement(Math.PI / 4, 0.05, 50, { x_km: 0, y_km: 0 }, "obs-2", "passive_acoustic");
    const h = m.h([1000, 1000, 0, 0, 0, 0]);
    expect(h[0]).toBeCloseTo(Math.PI / 4, 6);
  });

  it("kalmanUpdate is sensor-agnostic — position and bearing share the same code path", () => {
    const est = createInitialEstimate(0, 0, 0, 0, 5000);
    const pos = positionMeasurement([2000, 0], 300, 10, { x_km: 0, y_km: 0 }, "a", "eo_ir");
    const afterPos = kalmanUpdate(est, pos);
    expect(afterPos.mean[0]).toBeGreaterThan(0);
    expect(traceCov(afterPos.cov)).toBeLessThan(traceCov(est.cov));

    const est2 = createInitialEstimate(0, 0, 0, 0, 5000);
    const brg = horizontalBearingMeasurement(0, 0.1, 10, { x_km: -5, y_km: 0 }, "b", "passive_acoustic");
    const afterBrg = kalmanUpdate(est2, brg);
    expect(traceCov(afterBrg.cov)).toBeLessThan(traceCov(est2.cov));
  });
});
