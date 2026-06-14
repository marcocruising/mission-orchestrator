import type { Asset, AssetSensor, Belief } from "./types.js";
import type { Assignment, MissionDef, TaskDef } from "./stateEngine.js";
import type { OperatingPointResolver } from "./operatingPoint.js";
import { buildVehicleState } from "./vehicleState.js";
import { losAnglesDeg } from "./sensors/beamGeometry.js";
import { vehicleStateToPosition3, taskTargetToPosition3 } from "./spatial.js";
import { parsePatrolHandle, patrolCellPosition } from "./volume/patrolSweep.js";

function impliedPointingDeg(
  belief: Belief,
  asset: Asset,
  task: TaskDef,
  operatingPoint: string,
  resolveOperatingPoint: OperatingPointResolver
): { bearing_deg: number; elevation_deg: number } | null {
  const resolved = resolveOperatingPoint(asset, operatingPoint);
  if (resolved.bearing_deg != null) {
    return { bearing_deg: resolved.bearing_deg, elevation_deg: resolved.elevation_deg ?? 0 };
  }

  const patrol = parsePatrolHandle(operatingPoint);
  if (patrol && task.area) {
    const cell = patrolCellPosition(task, patrol.cell_id);
    if (cell) {
      const vehicle = buildVehicleState(belief, asset, resolved);
      return losAnglesDeg(vehicleStateToPosition3(vehicle), cell);
    }
  }

  const vehicle = buildVehicleState(belief, asset, resolved);
  return losAnglesDeg(vehicleStateToPosition3(vehicle), taskTargetToPosition3(task));
}

/**
 * One directional sensor → one pointing vector at a time (C2 / P5 hard gate).
 * Returns false when an asset serves multiple tasks with incompatible bearings
 * on a sensor that has beam_half_angle_deg set.
 */
export function checkPointingGate(
  assignments: Assignment[],
  missions: MissionDef[],
  sensors: AssetSensor[],
  belief: Belief,
  assets: Asset[],
  resolveOperatingPoint: OperatingPointResolver,
  minSeparationDeg = 15
): boolean {
  const taskMap = new Map(missions.flatMap((m) => m.tasks.map((t) => [t.id, t] as const)));
  const assetMap = new Map(assets.map((a) => [a.id, a]));
  const sensorsByAsset = new Map<string, AssetSensor[]>();
  for (const s of sensors) {
    if (!sensorsByAsset.has(s.asset_id)) sensorsByAsset.set(s.asset_id, []);
    sensorsByAsset.get(s.asset_id)!.push(s);
  }

  const byAsset = new Map<string, Assignment[]>();
  for (const asn of assignments) {
    if (!byAsset.has(asn.asset_id)) byAsset.set(asn.asset_id, []);
    byAsset.get(asn.asset_id)!.push(asn);
  }

  for (const [assetId, asns] of byAsset) {
    if (asns.length < 2) continue;
    const asset = assetMap.get(assetId);
    if (!asset) return false;

    const directional = (sensorsByAsset.get(assetId) ?? []).filter(
      (s) => s.beam_half_angle_deg != null && s.beam_half_angle_deg > 0
    );
    if (directional.length === 0) continue;

    const pointings: { bearing_deg: number; elevation_deg: number; sensor: string }[] = [];
    for (const asn of asns) {
      const task = taskMap.get(asn.task_id);
      if (!task) return false;
      for (const demand of task.demands) {
        const sensor = directional.find((s) => s.sensor === demand.sensor);
        if (!sensor) continue;
        const pointing = impliedPointingDeg(belief, asset, task, asn.operating_point, resolveOperatingPoint);
        if (pointing) pointings.push({ ...pointing, sensor: sensor.sensor });
      }
    }

    for (let i = 0; i < pointings.length; i++) {
      for (let j = i + 1; j < pointings.length; j++) {
        const a = pointings[i]!;
        const b = pointings[j]!;
        if (a.sensor !== b.sensor) continue;
        const dB = Math.abs(((a.bearing_deg - b.bearing_deg + 540) % 360) - 180);
        if (dB > minSeparationDeg) return false;
      }
    }
  }

  return true;
}
