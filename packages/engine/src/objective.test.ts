import { describe, it, expect } from "vitest";
import {
  computeObjective,
  coverageRewardTerm,
  moveCountPenaltyTerm,
  exposurePenaltyTerm,
  riskPenaltyTerm,
  DEFAULT_OBJECTIVE_TERMS,
  type ObjectiveContext,
  type ObjectiveTerm,
} from "./objective.js";
import type { EngineConfig, MissionDef } from "./stateEngine.js";

const config: EngineConfig = {
  p: 0.5,
  tier_full: 0.85,
  tier_degraded: 0.6,
  tier_at_risk: 0.3,
  H: 120,
  T_ref: 600,
  sigma: 0.4,
  lambda_move: 0.05,
  lambda_exp: 0.3,
  lambda_risk: 0.2,
  comms_budget: 1_000_000,
};

const missions: MissionDef[] = [
  {
    id: "m1",
    name: "Primary",
    priority: 0.9,
    tasks: [],
  },
  {
    id: "m2",
    name: "Secondary",
    priority: 0.3,
    tasks: [],
  },
];

function ctx(overrides: Partial<ObjectiveContext> = {}): ObjectiveContext {
  return {
    missions,
    covByMission: { m1: 0.8, m2: 0.5 },
    nMoves: 0,
    exposure: 0,
    risk: 0,
    config,
    ...overrides,
  };
}

describe("computeObjective (A0.4 — additive extensible terms)", () => {
  it("coverage reward matches Σ W_m · cov_m for a fixed fixture", () => {
    const reward = coverageRewardTerm(ctx());
    expect(reward).toBeCloseTo(0.9 * 0.8 + 0.3 * 0.5, 10);
    expect(reward).toBeCloseTo(0.87, 10);
  });

  it("each move subtracts exactly lambda_move from the objective", () => {
    const noMoves = computeObjective(ctx({ nMoves: 0 }));
    const twoMoves = computeObjective(ctx({ nMoves: 2 }));
    expect(noMoves - twoMoves).toBeCloseTo(0.05 * 2, 10);
    expect(moveCountPenaltyTerm(ctx({ nMoves: 2 }))).toBeCloseTo(-0.1, 10);
  });

  it("nonzero exposure lowers objective by lambda_exp × exposure", () => {
    const baseline = computeObjective(ctx({ exposure: 0 }));
    const exposed = computeObjective(ctx({ exposure: 0.5 }));
    expect(baseline - exposed).toBeCloseTo(0.3 * 0.5, 10);
    expect(exposurePenaltyTerm(ctx({ exposure: 0.5 }))).toBeCloseTo(-0.15, 10);
  });

  it("nonzero risk lowers objective by lambda_risk × risk", () => {
    const baseline = computeObjective(ctx({ risk: 0 }));
    const risky = computeObjective(ctx({ risk: 0.25 }));
    expect(baseline - risky).toBeCloseTo(0.2 * 0.25, 10);
    expect(riskPenaltyTerm(ctx({ risk: 0.25 }))).toBeCloseTo(-0.05, 10);
  });

  it("exposure=0 and risk=0 contribute zero penalty today", () => {
    const withPenalties = computeObjective(ctx());
    const withoutPenaltyTerms = computeObjective(ctx(), [coverageRewardTerm, moveCountPenaltyTerm]);
    expect(exposurePenaltyTerm(ctx())).toBeCloseTo(0, 12);
    expect(riskPenaltyTerm(ctx())).toBeCloseTo(0, 12);
    expect(withPenalties).toBeCloseTo(withoutPenaltyTerms, 12);
  });

  it("full default formula for a golden fixture", () => {
    const objective = computeObjective(ctx({ nMoves: 2, exposure: 0, risk: 0 }));
    // 0.9*0.8 + 0.3*0.5 - 0.05*2 = 0.77
    expect(objective).toBeCloseTo(0.77, 10);
  });

  it("stub term returning 0 is a no-op on the sum", () => {
    const baseline = computeObjective(ctx({ nMoves: 1 }));
    const withStub = computeObjective(ctx({ nMoves: 1 }), [
      ...DEFAULT_OBJECTIVE_TERMS,
      () => 0,
    ]);
    expect(withStub).toBeCloseTo(baseline, 12);
  });

  it("injecting an extra cost term changes objective only via that term", () => {
    const thrashingCost: ObjectiveTerm = (c) => -0.12 * c.nMoves;
    const baseline = computeObjective(ctx({ nMoves: 3 }));
    const withThrashing = computeObjective(ctx({ nMoves: 3 }), [
      ...DEFAULT_OBJECTIVE_TERMS,
      thrashingCost,
    ]);
    expect(withThrashing).toBeCloseTo(baseline - 0.36, 10);
  });

  it("higher exposure makes an otherwise identical plan rank lower", () => {
    const lowExp = computeObjective(ctx({ nMoves: 1, exposure: 0.1 }));
    const highExp = computeObjective(ctx({ nMoves: 1, exposure: 0.9 }));
    expect(lowExp).toBeGreaterThan(highExp);
    expect(highExp - lowExp).toBeCloseTo(-0.3 * 0.8, 10);
  });
});
