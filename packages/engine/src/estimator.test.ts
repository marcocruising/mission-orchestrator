import { describe, it, expect, test } from "vitest";
import { createInitialEstimate, covToEllipse, traceCov } from "./estimate.js";
import { positionMeasurement, horizontalBearingMeasurement } from "./measurement.js";
import {
  FixedGainEstimator,
  defaultEstimator,
  runEstimatorPipeline,
  positionUncertaintyKm,
} from "./estimator.js";
import type { Estimator } from "./estimator.js";
import { kmToM } from "./spatial.js";

describe("FixedGainEstimator (T2.3)", () => {
  const estimator = new FixedGainEstimator();

  it("predict grows trace(cov) with dt", () => {
    const est = createInitialEstimate(0, 0, 0, 0, 500);
    const before = traceCov(est.cov);
    const predicted = estimator.predict(est, 10, 0.05);
    expect(traceCov(predicted.cov)).toBeGreaterThan(before);
    expect(predicted.mean[0]).toBe(0);
    expect(predicted.mean[1]).toBe(0);
  });

  it("update shrinks trace(cov) and pulls mean toward measurement z", () => {
    const est = createInitialEstimate(0, 0, 0, 0, 3000);
    const m = positionMeasurement([5000, 1000], 200, 1, { x_km: 0, y_km: 0 }, "uuv-alpha", "eo_ir");
    const updated = estimator.update(est, m);
    expect(traceCov(updated.cov)).toBeLessThan(traceCov(est.cov));
    expect(updated.mean[0]).toBeGreaterThan(0);
    expect(updated.mean[0]).toBeLessThan(5000);
    expect(updated.mean[1]).toBeGreaterThan(0);
    expect(updated.mean[1]).toBeLessThan(1000);
  });

  it("is deterministic for fixed inputs", () => {
    const est = createInitialEstimate(kmToM(1), kmToM(2), 0, 0, kmToM(1));
    const m = positionMeasurement([1500, 2500], 100, 5, { x_km: 0, y_km: 0 }, "x", "radar");
    const a = estimator.update(estimator.predict(est, 2), m);
    const b = estimator.update(estimator.predict(est, 2), m);
    expect(a.mean).toEqual(b.mean);
    expect(a.cov).toEqual(b.cov);
  });

  it("seam-swap: alternate Estimator implementation compiles at same call sites", () => {
    const stub: Estimator = {
      predict: (e, dt) => defaultEstimator.predict(e, dt),
      update: (e, m) => defaultEstimator.update(e, m),
    };
    const est = createInitialEstimate(0, 0, 0, 0);
    const m = positionMeasurement([1000, 0], 500, 1, { x_km: 0, y_km: 0 }, "s", "radar");
    const out = stub.update(stub.predict(est, 1), m);
    expect(out.mean[0]).toBeGreaterThan(0);
  });

  it("second position fix shrinks uncertainty vs first detection alone", () => {
    const initial = createInitialEstimate(0, 0, 0, 0, 2000);
    const m1 = positionMeasurement([500, 0], 800, 1, { x_km: 0, y_km: 0 }, "a", "radar");
    const afterOne = runEstimatorPipeline(estimator, initial, [m1]);
    const m2 = positionMeasurement([600, 100], 800, 2, { x_km: 0, y_km: 0 }, "b", "radar");
    const afterTwo = runEstimatorPipeline(estimator, initial, [m1, m2]);
    expect(positionUncertaintyKm(afterTwo)).toBeLessThan(positionUncertaintyKm(afterOne));
  });

  it("one detection yields a fat blob; refined detections shrink the ellipse", () => {
    const initial = createInitialEstimate(0, 0, 0, 0, 2000);
    const one = runEstimatorPipeline(estimator, initial, [
      positionMeasurement([0, 0], 1500, 1, { x_km: 0, y_km: 0 }, "a", "radar"),
    ]);
    const two = runEstimatorPipeline(estimator, initial, [
      positionMeasurement([0, 0], 1500, 1, { x_km: 0, y_km: 0 }, "a", "radar"),
      positionMeasurement([200, 100], 500, 2, { x_km: 0, y_km: 0 }, "b", "radar"),
    ]);
    const blobOne = covToEllipse(one.cov, one.mean);
    const blobTwo = covToEllipse(two.cov, two.mean);
    expect(blobOne.semiMajor).toBeGreaterThan(blobTwo.semiMajor);
  });
});

describe("Kalman-readiness (future contract)", () => {
  test.todo(
    "two bearing-only measurements ~90° apart collapse covariance anisotropically (FixedGain/Kalman swap target)"
  );

  it("documents bearing-only pipeline runs without sensor branches today", () => {
    const est = createInitialEstimate(5000, 5000, 0, 0, 4000);
    const obs1 = { x_km: 0, y_km: 0 };
    const obs2 = { x_km: 10, y_km: 0 };
    const m1 = horizontalBearingMeasurement(Math.atan2(5000, 5000), 0.05, 1, obs1, "s1", "passive_acoustic");
    const m2 = horizontalBearingMeasurement(Math.atan2(5000, -5000), 0.05, 2, obs2, "s2", "passive_acoustic");
    const fused = runEstimatorPipeline(new FixedGainEstimator(), est, [m1, m2]);
    expect(Number.isFinite(fused.mean[0])).toBe(true);
    expect(fused.cov[0][0]).toBeLessThan(est.cov[0][0]);
  });
});
