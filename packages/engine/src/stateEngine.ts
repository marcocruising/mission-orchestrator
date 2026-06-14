import type { Asset, AssetSensor, Belief } from "./types.js";
import { getFact } from "./types.js";
import {
  effectiveQuality,
  satisfaction,
  coverageTask,
  coverageMission,
  tier,
  confidenceMission,
  isInfeasible,
  type VehicleState,
  type SensorSpec,
} from "./coverage.js";
import { freshness } from "./freshness.js";

export interface TaskDemand {
  sensor: string;
  min_quality: number;
}

export interface TaskConstraint {
  kind: "depth" | "domain" | "los" | "capacity";
  param: Record<string, unknown>;
}

export interface TaskDef {
  id: string;
  mission_id: string;
  w_t: number;
  target_x: number;
  target_y: number;
  target_depth_m: number;
  window_end_s: number | null;
  demands: TaskDemand[];
  constraints: TaskConstraint[];
}

export interface MissionDef {
  id: string;
  name: string;
  priority: number;
  tasks: TaskDef[];
}

export interface Assignment {
  id: string;
  asset_id: string;
  task_id: string;
  operating_point: string;
  issued_ts: number;
}

export interface EngineConfig {
  p: number;
  tier_full: number;
  tier_degraded: number;
  tier_at_risk: number;
  H: number;
  T_ref: number;
  sigma: number;
  lambda_move: number;
  lambda_exp: number;
  lambda_risk: number;
}

export const DEFAULT_CONFIG: EngineConfig = {
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
};

export interface MissionStateRow {
  mission_id: string;
  tick: number;
  cov_baseline: number;
  cov_now: number;
  tier: ReturnType<typeof tier>;
  confidence: number;
  time_to_act_s: number;
  impact: number;
  urgency: number;
  salience: number;
}

export interface EngineInput {
  belief: Belief;
  assets: Asset[];
  sensors: AssetSensor[];
  missions: MissionDef[];
  assignments: Assignment[];
  config: EngineConfig;
  now: number;
  /** Sticky baselines keyed by mission_id */
  covBaselines: Map<string, number>;
  /** Resolved speed per assignment from operating_point */
  resolveSpeed: (asset: Asset, operatingPoint: string) => number;
}

function factNum(belief: Belief, assetId: string, field: string, fallback: number): number {
  const v = getFact(belief, assetId, field)?.value;
  return typeof v === "number" ? v : fallback;
}

function vehicleFromBelief(belief: Belief, asset: Asset, speedKn: number): VehicleState {
  return {
    asset_id: asset.id,
    x_km: factNum(belief, asset.id, "x_km", 0),
    y_km: factNum(belief, asset.id, "y_km", 0),
    depth_m: factNum(belief, asset.id, "depth_m", 0),
    speed_kn: speedKn,
    top_speed_kn: asset.top_speed_kn,
  };
}

function checkHardConstraints(
  asset: Asset,
  task: TaskDef,
  vehicle: VehicleState
): boolean {
  for (const c of task.constraints) {
    if (c.kind === "depth" && vehicle.depth_m > asset.depth_rating_m) return false;
    if (c.kind === "depth" && typeof c.param.min_depth_m === "number" && vehicle.depth_m < c.param.min_depth_m)
      return false;
    if (c.kind === "domain" && c.param.domain !== asset.domain) return false;
  }
  return true;
}

function sensorSpec(s: AssetSensor): SensorSpec {
  return {
    sensor: s.sensor,
    base_quality: s.base_quality,
    max_range_km: s.max_range_km,
    k_motion: s.k_motion,
  };
}

/** Compute task coverage from assignments + belief (pure). */
export function computeTaskCoverage(
  task: TaskDef,
  assignments: Assignment[],
  input: EngineInput
): { cov_t: number; freshnessValues: number[]; infeasible: boolean } {
  const assetMap = new Map(input.assets.map((a) => [a.id, a]));
  const sensorsByAsset = new Map<string, AssetSensor[]>();
  for (const s of input.sensors) {
    if (!sensorsByAsset.has(s.asset_id)) sensorsByAsset.set(s.asset_id, []);
    sensorsByAsset.get(s.asset_id)!.push(s);
  }

  const taskAssignments = assignments.filter((a) => a.task_id === task.id);
  const axisSats: number[] = [];
  const freshnessValues: number[] = [];

  for (const demand of task.demands) {
    const qualities: number[] = [];
    for (const asn of taskAssignments) {
      const asset = assetMap.get(asn.asset_id);
      if (!asset) continue;
      const speed = input.resolveSpeed(asset, asn.operating_point);
      const vehicle = vehicleFromBelief(input.belief, asset, speed);
      if (!checkHardConstraints(asset, task, vehicle)) continue;
      const sensor = sensorsByAsset.get(asn.asset_id)?.find((s) => s.sensor === demand.sensor);
      if (!sensor) continue;
      const q = effectiveQuality(
        sensorSpec(sensor),
        { target_x: task.target_x, target_y: task.target_y, target_depth_m: task.target_depth_m },
        vehicle,
        input.config.p
      );
      if (isInfeasible(q)) return { cov_t: 0, freshnessValues: [], infeasible: true };
      qualities.push(q);
      const posFact = getFact(input.belief, asn.asset_id, "x_km");
      if (posFact) {
        freshnessValues.push(
          posFact.confidence * freshness(input.now - posFact.ts, posFact.half_life_s)
        );
      }
    }
    const sat = satisfaction(qualities, demand.min_quality);
    if (isInfeasible(sat)) return { cov_t: 0, freshnessValues: [], infeasible: true };
    axisSats.push(sat as number);
  }

  const covResult = coverageTask(axisSats.length ? axisSats : [1]);
  return {
    cov_t: isInfeasible(covResult) ? 0 : (covResult as number),
    freshnessValues,
    infeasible: isInfeasible(covResult),
  };
}

export function computeMissionCoverage(
  mission: MissionDef,
  assignments: Assignment[],
  input: EngineInput
): { cov_m: number; confidence: number } {
  const weighted: { w_t: number; cov_t: number }[] = [];
  const allFresh: number[] = [];
  for (const task of mission.tasks) {
    const { cov_t, freshnessValues, infeasible } = computeTaskCoverage(task, assignments, input);
    weighted.push({ w_t: task.w_t, cov_t: infeasible ? 0 : cov_t });
    allFresh.push(...freshnessValues);
  }
  return {
    cov_m: coverageMission(weighted),
    confidence: confidenceMission(allFresh.length ? allFresh : [1]),
  };
}

function timeToAct(mission: MissionDef, input: EngineInput): number {
  const EPS = 1;
  let minWindow = Infinity;
  for (const task of mission.tasks) {
    if (task.window_end_s != null) {
      minWindow = Math.min(minWindow, task.window_end_s - input.now);
    }
  }
  if (minWindow !== Infinity) return Math.max(minWindow, EPS);

  for (const asn of input.assignments.filter((a) => mission.tasks.some((t) => t.id === a.task_id))) {
    const battery = factNum(input.belief, asn.asset_id, "battery_pct", 100);
    minWindow = Math.min(minWindow, battery * 6);
  }
  return Math.max(minWindow === Infinity ? 600 : minWindow, EPS);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Full MissionState recompute — THE one derived pass (P3). */
export function recomputeMissionStates(input: EngineInput, tick: number): MissionStateRow[] {
  return input.missions.map((mission) => {
    const { cov_m, confidence } = computeMissionCoverage(mission, input.assignments, input);
    const cov_baseline = input.covBaselines.get(mission.id) ?? cov_m;
    const time_to_act_s = timeToAct(mission, input);
    const impact = mission.priority * (cov_baseline - cov_m);
    const urgency = clamp(1 - time_to_act_s / input.config.T_ref, 0, 1);
    const salience = impact * urgency * confidence;
    return {
      mission_id: mission.id,
      tick,
      cov_baseline,
      cov_now: cov_m,
      tier: tier(cov_m, {
        full: input.config.tier_full,
        degraded: input.config.tier_degraded,
        at_risk: input.config.tier_at_risk,
      }),
      confidence,
      time_to_act_s,
      impact,
      urgency,
      salience,
    };
  });
}

/** Default speed resolver — extended in S10 for operating points. */
export function defaultResolveSpeed(asset: Asset, operatingPoint: string): number {
  switch (operatingPoint) {
    case "STATION":
      return 0;
    case "SLOW":
      return asset.top_speed_kn * 0.25;
    case "FAST":
      return asset.top_speed_kn;
    default: {
      const n = Number(operatingPoint);
      return Number.isFinite(n) ? n : asset.top_speed_kn * 0.5;
    }
  }
}

/** Hard capacity gate: Σ demand ≤ capacity on every axis per vehicle. */
export function checkCapacityGate(
  assignments: Assignment[],
  missions: MissionDef[],
  sensors: AssetSensor[]
): boolean {
  const demandByAssetSensor = new Map<string, number>();
  const taskMap = new Map(missions.flatMap((m) => m.tasks.map((t) => [t.id, t] as const)));

  for (const asn of assignments) {
    const task = taskMap.get(asn.task_id);
    if (!task) continue;
    for (const d of task.demands) {
      const key = `${asn.asset_id}:${d.sensor}`;
      demandByAssetSensor.set(key, (demandByAssetSensor.get(key) ?? 0) + d.min_quality);
    }
  }

  for (const [key, demand] of demandByAssetSensor) {
    const [assetId, sensorName] = key.split(":");
    const sensor = sensors.find((s) => s.asset_id === assetId && s.sensor === sensorName);
    if (!sensor) return false;
    if (demand > sensor.base_quality) return false;
  }
  return true;
}

/** Non-binding fleet comms gate (shape for future bandwidth contention). */
export function checkFleetCommsGate(assignments: Assignment[]): boolean {
  const BIG = 1_000_000;
  return assignments.length <= BIG;
}
