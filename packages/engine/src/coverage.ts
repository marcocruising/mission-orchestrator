import {
  envMult,
  DEFAULT_ENV_FACTORS,
  type EnvFactor,
} from "./envMult.js";

export const INFEASIBLE = Symbol("INFEASIBLE");
export type Infeasible = typeof INFEASIBLE;

export type QualityResult = number | Infeasible;

export function isInfeasible(r: QualityResult): r is Infeasible {
  return r === INFEASIBLE;
}

export interface SensorSpec {
  sensor: string;
  base_quality: number;
  max_range_km: number;
  k_motion: number;
}

export interface VehicleState {
  asset_id: string;
  x_km: number;
  y_km: number;
  depth_m: number;
  speed_kn: number;
  top_speed_kn: number;
}

export interface TaskTarget {
  target_x: number;
  target_y: number;
  target_depth_m: number;
}

/** rangeMult(R) = (1 − R/Rmax)^p; HARD: R > Rmax → INFEASIBLE */
export function rangeMult(rangeKm: number, maxRangeKm: number, p = 0.5): QualityResult {
  if (rangeKm > maxRangeKm) return INFEASIBLE;
  if (maxRangeKm <= 0) return INFEASIBLE;
  return Math.pow(1 - rangeKm / maxRangeKm, p);
}

export { envMultMotion } from "./envMult.js";

export function effectiveQuality(
  sensor: SensorSpec,
  task: TaskTarget,
  vehicle: VehicleState,
  p = 0.5,
  envFactors: EnvFactor[] = DEFAULT_ENV_FACTORS
): QualityResult {
  const R = Math.hypot(task.target_x - vehicle.x_km, task.target_y - vehicle.y_km);
  const rm = rangeMult(R, sensor.max_range_km, p);
  if (isInfeasible(rm)) return INFEASIBLE;
  const em = envMult(envFactors, { sensor, vehicle });
  return sensor.base_quality * rm * em;
}

/** sat(t,s) = min( Σ_v q / demand , 1 ) */
export function satisfaction(
  qualities: QualityResult[],
  demand: number
): QualityResult {
  if (demand <= 0) return 1;
  let sum = 0;
  for (const q of qualities) {
    if (isInfeasible(q)) return INFEASIBLE;
    sum += q;
  }
  return Math.min(sum / demand, 1);
}

/** Combines per-axis satisfaction values into a single task coverage score. */
export type AxisAggregator = (axisSats: number[]) => number;

/** Liebig / bundle-of-sensors: weakest axis caps the task (P7). */
export function minAxisAggregator(axisSats: number[]): number {
  return Math.min(...axisSats);
}

/**
 * Stub aggregator for seam tests — arithmetic mean (less pessimistic than min).
 * Future substitutable-sensor body replaces this with a real soft-min (T1.7).
 */
export function meanAxisAggregator(axisSats: number[]): number {
  return axisSats.reduce((sum, v) => sum + v, 0) / axisSats.length;
}

/** cov_t = aggregate over required sensor axes (default: min). */
export function coverageTask(
  axisSats: QualityResult[],
  aggregator: AxisAggregator = minAxisAggregator
): QualityResult {
  if (axisSats.length === 0) return 1;
  const numeric: number[] = [];
  for (const s of axisSats) {
    if (isInfeasible(s)) return INFEASIBLE;
    numeric.push(s);
  }
  return aggregator(numeric);
}

export interface WeightedTask {
  w_t: number;
  cov_t: number;
}

/** cov_m = Σ(w_t · cov_t) / Σ w_t */
export function coverageMission(tasks: WeightedTask[]): number {
  const totalW = tasks.reduce((s, t) => s + t.w_t, 0);
  if (totalW <= 0) return 0;
  return tasks.reduce((s, t) => s + t.w_t * t.cov_t, 0) / totalW;
}

export type CoverageTier = "FULL" | "DEGRADED" | "AT_RISK" | "LOST";

export interface TierThresholds {
  full: number;
  degraded: number;
  at_risk: number;
}

const DEFAULT_TIERS: TierThresholds = { full: 0.85, degraded: 0.6, at_risk: 0.3 };

export function tier(covM: number, thresholds: TierThresholds = DEFAULT_TIERS): CoverageTier {
  if (covM >= thresholds.full) return "FULL";
  if (covM >= thresholds.degraded) return "DEGRADED";
  if (covM >= thresholds.at_risk) return "AT_RISK";
  return "LOST";
}

/** confidence_m = min freshness of facts feeding cov_m */
export function confidenceMission(freshnessValues: number[]): number {
  if (freshnessValues.length === 0) return 1;
  return Math.min(...freshnessValues);
}
