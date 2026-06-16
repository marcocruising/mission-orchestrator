import type { EngineConfig, MissionDef } from "./stateEngine.js";

/** Inputs available to every objective term (pure, no side effects). */
export interface ObjectiveContext {
  missions: MissionDef[];
  covByMission: Record<string, number>;
  nMoves: number;
  exposure: number;
  risk: number;
  config: EngineConfig;
}

/**
 * One additive component of the plan objective (higher total = better plan).
 * Register new terms for movement costs, comms load, fuel, route distance, etc.
 */
export type ObjectiveTerm = (ctx: ObjectiveContext) => number;

/** Σ_m W_m · cov_m(plan) */
export function coverageRewardTerm(ctx: ObjectiveContext): number {
  return ctx.missions.reduce(
    (sum, mission) => sum + mission.priority * (ctx.covByMission[mission.id] ?? 0),
    0
  );
}

/** −λ_move · n_moves — thrashing / reassignment cost (v1 body). */
export function moveCountPenaltyTerm(ctx: ObjectiveContext): number {
  return -ctx.config.lambda_move * ctx.nMoves;
}

/** −λ_exp · exposure — geographic threat proximity along assignment routes (D3). */
export function exposurePenaltyTerm(ctx: ObjectiveContext): number {
  return -ctx.config.lambda_exp * ctx.exposure;
}

/** −λ_risk · risk — intensity-weighted route risk (D3). */
export function riskPenaltyTerm(ctx: ObjectiveContext): number {
  return -ctx.config.lambda_risk * ctx.risk;
}

export const DEFAULT_OBJECTIVE_TERMS: ObjectiveTerm[] = [
  coverageRewardTerm,
  moveCountPenaltyTerm,
  exposurePenaltyTerm,
  riskPenaltyTerm,
];

/** Sum over extensible term list — same seam pattern as envMult factor product. */
export function computeObjective(
  ctx: ObjectiveContext,
  terms: ObjectiveTerm[] = DEFAULT_OBJECTIVE_TERMS
): number {
  return terms.reduce((sum, term) => sum + term(ctx), 0);
}
