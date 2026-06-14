import type { Estimate } from "./estimate.js";
import { traceCov } from "./estimate.js";
import { StateLayout, mToKm } from "./spatial.js";
import type { Measurement } from "./measurement.js";
import { kalmanUpdate } from "./measurement.js";

export interface Estimator {
  predict(estimate: Estimate, dt: number, processNoiseQ0?: number): Estimate;
  update(estimate: Estimate, measurement: Measurement): Estimate;
}

/** v1 body: constant-velocity predict + Kalman update using measurement.h / measurement.R. */
export class FixedGainEstimator implements Estimator {
  predict(estimate: Estimate, dt: number, processNoiseQ0 = 0.01): Estimate {
    if (dt <= 0) return { ...estimate, mean: [...estimate.mean], cov: estimate.cov.map((r) => [...r]) };
    const m = estimate.mean;
    const newMean = [...m];
    newMean[StateLayout.X] += m[StateLayout.VX] * dt;
    newMean[StateLayout.Y] += m[StateLayout.VY] * dt;
    newMean[StateLayout.Z] += m[StateLayout.VZ] * dt;
    const q = processNoiseQ0 * dt;
    const newCov = estimate.cov.map((row, i) => row.map((v, j) => v + (i === j ? q : 0)));
    return { layout: "cv6", mean: newMean, cov: newCov, ts: estimate.ts + dt };
  }

  update(estimate: Estimate, measurement: Measurement): Estimate {
    return kalmanUpdate(estimate, measurement);
  }
}

export const defaultEstimator = new FixedGainEstimator();

export function runEstimatorPipeline(
  estimator: Estimator,
  initial: Estimate,
  measurements: Measurement[],
  predictDtBetween = 1
): Estimate {
  let est = initial;
  for (const m of measurements) {
    const dt = Math.max(0, m.ts - est.ts);
    if (dt > 0) est = estimator.predict(est, dt, predictDtBetween > 0 ? predictDtBetween : dt);
    est = estimator.update(est, m);
  }
  return est;
}

export function positionUncertaintyKm(estimate: Estimate): number {
  return mToKm(
    Math.sqrt((estimate.cov[StateLayout.X][StateLayout.X] + estimate.cov[StateLayout.Y][StateLayout.Y]) / 2)
  );
}

export { traceCov };
