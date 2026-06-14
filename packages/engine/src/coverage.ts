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

/** envMult today: e^(−k·speed/vmax) — seam for additional factors */
export function envMultMotion(kMotion: number, speedKn: number, topSpeedKn: number): number {
  if (topSpeedKn <= 0) return 1;
  return Math.exp(-kMotion * (speedKn / topSpeedKn));
}

export function envMult(kMotion: number, speedKn: number, topSpeedKn: number): number {
  return envMultMotion(kMotion, speedKn, topSpeedKn);
}

export function effectiveQuality(
  sensor: SensorSpec,
  task: TaskTarget,
  vehicle: VehicleState,
  p = 0.5
): QualityResult {
  const R = Math.hypot(task.target_x - vehicle.x_km, task.target_y - vehicle.y_km);
  const rm = rangeMult(R, sensor.max_range_km, p);
  if (isInfeasible(rm)) return INFEASIBLE;
  const em = envMult(sensor.k_motion, vehicle.speed_kn, vehicle.top_speed_kn);
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

/** cov_t = min over required sensor axes */
export function coverageTask(axisSats: QualityResult[]): QualityResult {
  if (axisSats.length === 0) return 1;
  let min = 1;
  for (const s of axisSats) {
    if (isInfeasible(s)) return INFEASIBLE;
    min = Math.min(min, s);
  }
  return min;
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
