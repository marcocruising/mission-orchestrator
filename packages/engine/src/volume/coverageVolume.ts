import {
  effectiveQuality,
  coverageTask,
  isInfeasible,
  type SensorSpec,
  type TaskTarget,
} from "../coverage.js";
import { M_PER_KM, zMToDepthM, type Position3 } from "../spatial.js";
import type { Asset, AssetSensor, Belief } from "../types.js";
import { getFact } from "../types.js";
import type { EnvironmentContext } from "../environmentContext.js";
import type { OperatingPointResolver } from "../operatingPoint.js";
import { freshness } from "../freshness.js";
import type { TaskDemand, TaskDef, Assignment } from "../stateEngine.js";
import { buildVehicleState } from "../vehicleState.js";
import {
  discretizeFootprint,
  type AreaTaskParams,
  type VolumeCellSpec,
  type VolumeVisitRecord,
} from "./footprint.js";

export interface VolumeCoverageResult {
  cov_t: number;
  freshnessValues: number[];
  infeasible: boolean;
  volumeVisits: VolumeVisitRecord[];
}

export interface VolumeCoverageContext {
  task: TaskDef;
  params: AreaTaskParams;
  visits: VolumeVisitRecord[];
  assignments: Assignment[];
  belief: Belief;
  assets: Asset[];
  sensors: AssetSensor[];
  demands: TaskDemand[];
  now: number;
  p: number;
  environmentContext: EnvironmentContext;
  resolveOperatingPoint: OperatingPointResolver;
  planningOverrides?: Map<string, Position3>;
}

function checkHardConstraints(
  asset: Asset,
  task: TaskDef,
  vehicle: { depth_m: number }
): boolean {
  for (const c of task.constraints) {
    if (c.kind === "depth" && vehicle.depth_m > asset.depth_rating_m) return false;
    if (
      c.kind === "depth" &&
      typeof c.param.min_depth_m === "number" &&
      vehicle.depth_m < c.param.min_depth_m
    ) {
      return false;
    }
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
    beam_half_angle_deg: s.beam_half_angle_deg,
  };
}

function cellToTaskTarget(center: Position3): TaskTarget {
  return {
    target_x: center.x_m / M_PER_KM,
    target_y: center.y_m / M_PER_KM,
    target_depth_m: zMToDepthM(center.z_m),
  };
}

/** Linear decay to zero over one revisit interval after last_visit_ts. */
export function cellVisitScore(
  record: VolumeVisitRecord | undefined,
  now: number,
  revisitIntervalS: number
): number {
  if (!record || revisitIntervalS <= 0) return 0;
  const dt = now - record.last_visit_ts;
  if (dt >= revisitIntervalS) return 0;
  if (dt <= 0) return record.peak_quality;
  return record.peak_quality * (1 - dt / revisitIntervalS);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** Volume patrol leaf — 3D cell grid with revisit memory (C1 / T3.1 body). */
export function coverageVolume(ctx: VolumeCoverageContext): VolumeCoverageResult {
  const {
    task,
    params,
    visits,
    assignments,
    belief,
    assets,
    sensors,
    demands,
    now,
    p,
    environmentContext,
    resolveOperatingPoint,
    planningOverrides,
  } = ctx;

  const cells = discretizeFootprint(
    params.footprint,
    params.z_min_m,
    params.z_max_m,
    params.cell_size_m
  );

  const visitMap = new Map<string, VolumeVisitRecord>(
    visits.map((v) => [v.cell_id, { ...v }])
  );

  const assetMap = new Map(assets.map((a) => [a.id, a]));
  const sensorsByAsset = new Map<string, AssetSensor[]>();
  for (const s of sensors) {
    if (!sensorsByAsset.has(s.asset_id)) sensorsByAsset.set(s.asset_id, []);
    sensorsByAsset.get(s.asset_id)!.push(s);
  }

  const taskAssignments = assignments.filter((a) => a.task_id === task.id);
  const freshnessValues: number[] = [];
  const axisSats: number[] = [];

  for (const demand of demands) {
    for (const asn of taskAssignments) {
      const asset = assetMap.get(asn.asset_id);
      if (!asset) continue;
      const resolved = resolveOperatingPoint(asset, asn.operating_point);
      const vehicle = buildVehicleState(
        belief,
        asset,
        resolved,
        planningOverrides?.get(asn.asset_id)
      );
      if (!checkHardConstraints(asset, task, vehicle)) continue;

      const sensor = sensorsByAsset.get(asn.asset_id)?.find((s) => s.sensor === demand.sensor);
      if (!sensor) continue;

      const posFact = getFact(belief, asn.asset_id, "x_km");
      if (posFact) {
        freshnessValues.push(
          posFact.confidence * freshness(now - posFact.ts, posFact.half_life_s ?? 120)
        );
      }

      for (const cell of cells) {
        const q = effectiveQuality(
          sensorSpec(sensor),
          cellToTaskTarget(cell.center),
          vehicle,
          p,
          undefined,
          environmentContext
        );
        if (isInfeasible(q) || q < demand.min_quality) continue;

        const existing = visitMap.get(cell.cell_id);
        visitMap.set(cell.cell_id, {
          cell_id: cell.cell_id,
          last_visit_ts: now,
          peak_quality: existing ? Math.max(existing.peak_quality, q) : q,
        });
      }
    }

    const cellScores = cells.map((cell) =>
      cellVisitScore(visitMap.get(cell.cell_id), now, params.revisit_interval_s)
    );
    const axisMean = mean(cellScores);
    axisSats.push(axisMean);
  }

  if (demands.length === 0) {
    return {
      cov_t: 0,
      freshnessValues: [],
      infeasible: false,
      volumeVisits: [...visitMap.values()],
    };
  }

  const covResult = coverageTask(axisSats.length ? axisSats : [0]);
  return {
    cov_t: isInfeasible(covResult) ? 0 : (covResult as number),
    freshnessValues,
    infeasible: isInfeasible(covResult),
    volumeVisits: [...visitMap.values()],
  };
}

export type { VolumeCellSpec, VolumeVisitRecord, AreaTaskParams };
