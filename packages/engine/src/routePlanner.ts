import type { Asset, Belief } from "./types.js";
import { getFact } from "./types.js";
import type { Assignment, MissionDef } from "./stateEngine.js";
import { depthMToZM, taskTargetToPosition3, type Position3 } from "./spatial.js";
import { mToKm } from "./spatial.js";

/** Graded threat disc — intensity falls off linearly to the radius edge. */
export interface ThreatZone {
  id: string;
  x_km: number;
  y_km: number;
  radius_km: number;
  /** Peak harm weight [0, 1] at center. */
  intensity: number;
  z_min_m?: number;
  z_max_m?: number;
}

/** Hard exclusion disc — routes intersecting it are infeasible (P5 gate). */
export interface NoGoZone {
  id: string;
  x_km: number;
  y_km: number;
  radius_km: number;
  z_min_m?: number;
  z_max_m?: number;
}

export interface RouteMeasureInput {
  assignments: Assignment[];
  missions: MissionDef[];
  belief: Belief;
  assets: Asset[];
  planningOverrides?: Map<string, Position3>;
}

export interface RouteExposure {
  exposure: number;
  risk: number;
}

/** Measures route exposure/risk for plan objective terms (D3 / S11). */
export interface RoutePlanner {
  measure(input: RouteMeasureInput): RouteExposure;
  readonly noGos: readonly NoGoZone[];
}

interface Segment2D {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  z_m: number;
}

/** Minimum distance from point (px,py) to segment (ax,ay)-(bx,by) in km. */
export function segmentMinDistanceKm(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  px: number,
  py: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return Math.hypot(px - ax, py - ay);
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.hypot(px - projX, py - projY);
}

function factNum(belief: Belief, assetId: string, field: string, fallback: number): number {
  const v = getFact(belief, assetId, field)?.value;
  return typeof v === "number" ? v : fallback;
}

function assetPositionKm(
  belief: Belief,
  assetId: string,
  override?: Position3
): { x_km: number; y_km: number; z_m: number } {
  if (override) {
    return { x_km: mToKm(override.x_m), y_km: mToKm(override.y_m), z_m: override.z_m };
  }
  const zFact = getFact(belief, assetId, "z_m");
  const z_m =
    typeof zFact?.value === "number"
      ? zFact.value
      : depthMToZM(factNum(belief, assetId, "depth_m", 0));
  return {
    x_km: factNum(belief, assetId, "x_km", 0),
    y_km: factNum(belief, assetId, "y_km", 0),
    z_m,
  };
}

function taskPositionKm(task: MissionDef["tasks"][number]): { x_km: number; y_km: number; z_m: number } {
  const pos = taskTargetToPosition3(task);
  return { x_km: mToKm(pos.x_m), y_km: mToKm(pos.y_m), z_m: pos.z_m };
}

function zOverlaps(zone: { z_min_m?: number; z_max_m?: number }, z_m: number): boolean {
  const lo = zone.z_min_m ?? -Infinity;
  const hi = zone.z_max_m ?? Infinity;
  return z_m >= lo && z_m <= hi;
}

function assignmentSegments(input: RouteMeasureInput): Segment2D[] {
  const taskMap = new Map(input.missions.flatMap((m) => m.tasks.map((t) => [t.id, t] as const)));
  const assetMap = new Map(input.assets.map((a) => [a.id, a]));
  const segments: Segment2D[] = [];

  for (const asn of input.assignments) {
    const asset = assetMap.get(asn.asset_id);
    const task = taskMap.get(asn.task_id);
    if (!asset || !task) continue;

    const from = assetPositionKm(
      input.belief,
      asn.asset_id,
      input.planningOverrides?.get(asn.asset_id)
    );
    const to = taskPositionKm(task);
    segments.push({
      ax: from.x_km,
      ay: from.y_km,
      bx: to.x_km,
      by: to.y_km,
      z_m: (from.z_m + to.z_m) / 2,
    });
  }
  return segments;
}

function threatProximity(segment: Segment2D, threat: ThreatZone): number {
  if (!zOverlaps(threat, segment.z_m)) return 0;
  const d = segmentMinDistanceKm(
    segment.ax,
    segment.ay,
    segment.bx,
    segment.by,
    threat.x_km,
    threat.y_km
  );
  if (d >= threat.radius_km) return 0;
  return 1 - d / threat.radius_km;
}

function measureSegments(
  segments: Segment2D[],
  threats: readonly ThreatZone[]
): RouteExposure {
  let exposure = 0;
  let risk = 0;

  for (const segment of segments) {
    for (const threat of threats) {
      const prox = threatProximity(segment, threat);
      if (prox > 0) {
        exposure = Math.max(exposure, prox);
        risk = Math.max(risk, prox * threat.intensity);
      }
    }
  }

  return { exposure, risk };
}

export function checkNoGoGate(input: RouteMeasureInput & { noGos: readonly NoGoZone[] }): boolean {
  const segments = assignmentSegments(input);
  for (const segment of segments) {
    for (const zone of input.noGos) {
      if (!zOverlaps(zone, segment.z_m)) continue;
      const d = segmentMinDistanceKm(
        segment.ax,
        segment.ay,
        segment.bx,
        segment.by,
        zone.x_km,
        zone.y_km
      );
      if (d < zone.radius_km) return false;
    }
  }
  return true;
}

export function buildRoutePlanner(
  threats: readonly ThreatZone[],
  noGos: readonly NoGoZone[]
): RoutePlanner {
  return {
    noGos,
    measure(input) {
      return measureSegments(assignmentSegments(input), threats);
    },
  };
}

/** Default when no threats are loaded — exposure/risk stay zero (backward compatible). */
export const emptyRoutePlanner: RoutePlanner = buildRoutePlanner([], []);
