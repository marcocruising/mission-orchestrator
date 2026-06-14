import { describe, it, expect } from "vitest";
import {
  ConstantVelocityModel,
  cvTransitionMatrix,
  defaultConstantVelocityModel,
  initialLostContactState,
  propagateState,
  traceProcessNoise,
} from "./motionModel.js";
import { covToEllipse } from "./estimate.js";
import { StateLayout } from "./spatial.js";
import { ownAssetSearchUncertainty } from "./searchRegion.js";

const KNOTS_TO_M_S = 1852 / 3600;

describe("MotionModel (T2.5)", () => {
  it("ConstantVelocityModel advances position by v·dt", () => {
    const state = [0, 0, 0, 10, 5, -1];
    state[StateLayout.VX] = 10;
    state[StateLayout.VY] = 5;
    state[StateLayout.VZ] = -1;
    const { mean } = defaultConstantVelocityModel.predict(state, 2);
    expect(mean[StateLayout.X]).toBeCloseTo(20, 6);
    expect(mean[StateLayout.Y]).toBeCloseTo(10, 6);
    expect(mean[StateLayout.Z]).toBeCloseTo(-2, 6);
  });

  it("process noise Q grows with dt", () => {
    const model = new ConstantVelocityModel(2);
    const q1 = model.predict([0, 0, 0, 0, 0, 0], 1).Q;
    const q5 = model.predict([0, 0, 0, 0, 0, 0], 5).Q;
    expect(traceProcessNoise(q5)).toBeGreaterThan(traceProcessNoise(q1));
    expect(traceProcessNoise(q1)).toBeCloseTo(2 * 6, 6);
  });

  it("propagateState increases position uncertainty with dt", () => {
    const vMaxMs = 8 * KNOTS_TO_M_S;
    const initial = initialLostContactState(0, 0, -50, vMaxMs);
    const short = propagateState(initial.mean, initial.cov, 60, defaultConstantVelocityModel);
    const long = propagateState(initial.mean, initial.cov, 3600, defaultConstantVelocityModel);
    expect(long.cov[StateLayout.X][StateLayout.X]).toBeGreaterThan(
      short.cov[StateLayout.X][StateLayout.X]
    );
  });

  it("search ellipse semiMajor matches horizontal block of propagated cov", () => {
    const vMaxKn = 10;
    const vMaxMs = vMaxKn * KNOTS_TO_M_S;
    const dt = 7200;
    const initial = initialLostContactState(0, 0, 0, vMaxMs);
    const { mean, cov } = propagateState(initial.mean, initial.cov, dt, defaultConstantVelocityModel);
    const xyMean = (cov[0][0] + cov[1][1]) / 2;
    const displayCov = cov.map((row) => [...row]);
    displayCov[0][0] = xyMean;
    displayCov[1][1] = xyMean;
    displayCov[0][1] = 0;
    displayCov[1][0] = 0;
    const fromCov = covToEllipse(displayCov, mean, 2);
    const fromSearch = ownAssetSearchUncertainty(0, 0, 0, vMaxKn, dt, 0, 2, 1);
    expect(fromSearch.region.semiMajor).toBeCloseTo(fromCov.semiMajor, 3);
  });

  it("cvTransitionMatrix links position to velocity", () => {
    const F = cvTransitionMatrix(3);
    expect(F[StateLayout.X][StateLayout.VX]).toBe(3);
    expect(F[StateLayout.Y][StateLayout.VY]).toBe(3);
    expect(F[StateLayout.Z][StateLayout.VZ]).toBe(3);
  });
});
