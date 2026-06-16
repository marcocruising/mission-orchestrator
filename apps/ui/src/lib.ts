import { createClient } from "@supabase/supabase-js";
import {
  ownAssetSearchRegion,
  ownAssetSearchUncertainty,
  searchEllipseSemiMajor,
  zMFromBeliefFields,
  discretizeFootprint,
  kmToM,
  mToKm,
  effectiveQuality,
  isInfeasible,
  tier,
  buildEnvironmentContext,
  FIELD_KINDS,
  type EnvironmentContext,
  type FieldKind,
  type PlanMove,
} from "@mission-orchestrator/engine";

const url = import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.SUPABASE_URL ?? "";
const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.SUPABASE_ANON_KEY ?? "";

export const supabase = url && key ? createClient(url, key) : null;

export const MAP_SIZE_KM = 20;
export const OIL_RIG = { x_km: 17, y_km: 10 };
export const SEAFLOOR_Z_M = -60;
export const SCENARIO_MAX_TICK = 8;

export const TIER_CSS: Record<string, string> = {
  FULL: "--full",
  DEGRADED: "--degraded",
  AT_RISK: "--atrisk",
  LOST: "--lost",
};

export const DOM_CSS: Record<string, string> = {
  UAV: "--air",
  USV: "--surf",
  UUV: "--sub",
};

export interface AssetRow {
  id: string;
  kind: string;
  domain: string;
  top_speed_kn: number;
}

export interface BeliefFact {
  asset_id: string;
  field: string;
  value: unknown;
  ts: number;
}

export interface MissionRow {
  id: string;
  name: string;
}

export interface MissionStateRow {
  mission_id: string;
  tick: number;
  cov_baseline: number;
  cov_now: number;
  tier: string;
  confidence: number;
  salience: number;
}

export interface PlanEvalRow {
  plan_id: string;
  objective: number;
  cov_by_mission: Record<string, number>;
  cascades: { mission_id: string; delta: number }[];
  assumptions: string[];
}

export interface CandidatePlanRow {
  plan_id: string;
  moves: PlanMove[];
  n_moves: number;
}

export interface AlertRow {
  ts: number;
  mission_id: string;
  salience: number;
  tier_change: string | null;
  summary_text: string | null;
  shown: boolean;
}

export interface TaskRow {
  id: string;
  mission_id: string;
  kind: string;
  target_x: number;
  target_y: number;
  target_depth_m: number;
  footprint: unknown;
  z_min_m: number | null;
  z_max_m: number | null;
  cell_size_m: number | null;
}

export interface VolumeVisitRow {
  task_id: string;
  cell_id: string;
  peak_quality: number;
}

export interface AssetSensorRow {
  asset_id: string;
  sensor: string;
  base_quality: number;
  max_range_km: number;
  k_motion: number;
  beam_half_angle_deg: number | null;
}

export interface AssignmentRow {
  asset_id: string;
  task_id: string;
  operating_point: string;
}

export interface DecisionLogRow {
  ts: number;
  chosen_plan_id: string | null;
  operator: string;
}

export { ownAssetSearchRegion, ownAssetSearchUncertainty, searchEllipseSemiMajor, zMFromBeliefFields };

export type EnvSampleDbRow = {
  ts: number;
  kind: string;
  x_km: number;
  y_km: number;
  depth_m: number;
  value: number;
};

export type { EnvironmentContext };

export function environmentContextFromDbRows(
  rows: EnvSampleDbRow[],
  tick: number
): EnvironmentContext | undefined {
  if (rows.length === 0) return undefined;
  const samples = rows
    .filter((r) => (FIELD_KINDS as readonly string[]).includes(r.kind))
    .map((r) => ({
      ts: Number(r.ts),
      kind: r.kind as FieldKind,
      x_km: Number(r.x_km),
      y_km: Number(r.y_km),
      depth_m: Number(r.depth_m),
      value: Number(r.value),
    }));
  if (samples.length === 0) return undefined;
  return buildEnvironmentContext(tick, samples);
}

export function cssVar(name: string): string {
  return `var(${name})`;
}

export function tierCss(tierName: string): string {
  return cssVar(TIER_CSS[tierName] ?? "--muted");
}

export function domainCss(kind: string): string {
  return cssVar(DOM_CSS[kind] ?? "--muted");
}

export function mapY(yKm: number): number {
  return MAP_SIZE_KM - yKm;
}

/** Plan view SVG coords — chart area 60…500 × 40…300 */
export function kmToPlanSvg(xKm: number, yKm: number): { x: number; y: number } {
  return {
    x: 60 + (xKm / MAP_SIZE_KM) * 440,
    y: 40 + (1 - yKm / MAP_SIZE_KM) * 260,
  };
}

/** Profile view: signed z (m) → SVG y in 560×168 viewBox */
export function zToProfileY(zM: number): number {
  if (zM >= 0) return 40 - (zM / 2000) * 38;
  return 42 + (-zM / 90) * 112;
}

export function formatZ(zM: number): string {
  if (zM >= 0) return `+${Math.round(zM)} m`;
  return `${Math.round(zM)} m`;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m <= 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function formatClockTs(ts: number, baseTs = 0): string {
  const elapsed = Math.max(0, ts - baseTs);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function assetDisplayName(id: string): string {
  return id
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/ Sentinel /g, "-")
    .replace(/ Guardian/g, " Guardian")
    .replace(/ Overwatch/g, " Overwatch");
}

export function missionShortName(id: string, names: Map<string, string>): string {
  const full = names.get(id);
  if (!full) return id.replace("mission-", "");
  const words = full.split(/\s+/);
  return words.length <= 2 ? full : words.slice(0, 2).join(" ");
}

export function factMapForAsset(facts: BeliefFact[], assetId: string): Record<string, unknown> {
  const m: Record<string, unknown> = {};
  for (const f of facts.filter((x) => x.asset_id === assetId)) m[f.field] = f.value;
  return m;
}

export function lastContactTs(facts: BeliefFact[], assetId: string): number {
  const ts = facts.filter((f) => f.asset_id === assetId).map((f) => f.ts);
  return ts.length ? Math.max(...ts) : 0;
}

export function assetLinkUp(
  facts: BeliefFact[],
  assetId: string,
  simNow: number
): boolean {
  const f = factMapForAsset(facts, assetId);
  const commsUp = f.comms_up !== false;
  const lc = lastContactTs(facts, assetId);
  const stale = lc > 0 && simNow - lc >= 1;
  return commsUp && !stale;
}

export function assetStatus(
  facts: BeliefFact[],
  assetId: string,
  simNow: number
): { status: "ok" | "warn" | "lost"; text: string } {
  if (!assetLinkUp(facts, assetId, simNow)) {
    const lc = lastContactTs(facts, assetId);
    const silent = lc > 0 ? simNow - lc : 0;
    return { status: "lost", text: silent > 0 ? `lost ${formatDuration(silent)}` : "lost comms" };
  }
  const f = factMapForAsset(facts, assetId);
  const batt = Number(f.battery_pct ?? 100) / 100;
  if (batt < 0.5) return { status: "warn", text: `batt ${Math.round(batt * 100)}%` };
  return { status: "ok", text: "on task" };
}

export function formatPlanMove(
  moves: PlanMove[],
  assetNames: Map<string, string>,
  taskLabels: Map<string, string>
): string {
  if (moves.length === 0) return "Hold — accept loss (do nothing)";
  const parts = moves.map((m) => {
    const asset = assetNames.get(m.asset_id) ?? m.asset_id;
    if (m.kind === "reassign") {
      const task = taskLabels.get(m.task_id) ?? m.task_id;
      return `Reassign ${asset} → ${task}`;
    }
    return `Set ${asset} to ${m.operating_point}`;
  });
  return parts.join("; ");
}

export function sensorEffectiveQuality(
  sensor: AssetSensorRow,
  asset: AssetRow,
  facts: BeliefFact[],
  task: TaskRow | undefined,
  environment?: EnvironmentContext
): number {
  const f = factMapForAsset(facts, asset.id);
  const x = Number(f.x_km ?? 0);
  const y = Number(f.y_km ?? 0);
  const z_m = zMFromBeliefFields({ z_m: f.z_m, depth_m: f.depth_m });
  const speed = Number(f.speed_kn ?? 0);
  const target = task ?? {
    target_x: 0,
    target_y: 0,
    target_depth_m: 0,
  };
  const q = effectiveQuality(
    {
      sensor: sensor.sensor,
      base_quality: sensor.base_quality,
      max_range_km: sensor.max_range_km,
      k_motion: sensor.k_motion,
      beam_half_angle_deg: sensor.beam_half_angle_deg ?? undefined,
    },
    {
      target_x: target.target_x,
      target_y: target.target_y,
      target_depth_m: target.target_depth_m,
    },
    {
      asset_id: asset.id,
      x_km: x,
      y_km: y,
      depth_m: z_m < 0 ? -z_m : 0,
      z_m,
      speed_kn: speed,
      top_speed_kn: asset.top_speed_kn,
    },
    0.5,
    undefined,
    environment
  );
  if (isInfeasible(q)) return 0;
  return q;
}

export function tierFromCov(cov: number): string {
  return tier(cov);
}

export function aabbKmFromFootprint(raw: unknown): {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const fp = raw as Record<string, unknown>;
  if (fp.kind !== "aabb") return null;
  const cx = Number(fp.center_x_km);
  const cy = Number(fp.center_y_km);
  const hw = Number(fp.half_width_km);
  const hh = Number(fp.half_height_km);
  if ([cx, cy, hw, hh].some((n) => Number.isNaN(n))) return null;
  return { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh };
}

export function cellCentersKm(task: TaskRow): { cell_id: string; x_km: number; y_km: number }[] {
  if (task.kind !== "AREA" || task.z_min_m == null || task.z_max_m == null) return [];
  const box = aabbKmFromFootprint(task.footprint);
  if (!box) return [];
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const hw = (box.x1 - box.x0) / 2;
  const hh = (box.y1 - box.y0) / 2;
  const cells = discretizeFootprint(
    {
      kind: "aabb",
      center: { x_m: kmToM(cx), y_m: kmToM(cy) },
      half_extent_m: { x: kmToM(hw), y: kmToM(hh) },
    },
    task.z_min_m,
    task.z_max_m,
    task.cell_size_m ?? 500
  );
  return cells.map((c) => ({
    cell_id: c.cell_id,
    x_km: mToKm(c.center.x_m),
    y_km: mToKm(c.center.y_m),
  }));
}

/** @deprecated use tierCss — kept for tests */
export function tierColor(tierName: string): string {
  switch (tierName) {
    case "FULL":
      return "#34b58a";
    case "DEGRADED":
      return "#e0a93a";
    case "AT_RISK":
      return "#e07d3a";
    default:
      return "#d2495f";
  }
}

export function domainColor(kind: string): string {
  switch (kind) {
    case "UAV":
      return "#7fb3d9";
    case "UUV":
      return "#5f74e6";
    case "USV":
    default:
      return "#38c2b0";
  }
}

export function sensorLabel(sensor: string): string {
  return sensor.replace(/_/g, " ");
}

export function parseOperatingPoint(op: string): string {
  if (op === "STATION" || op === "SLOW" || op === "FAST") return op;
  try {
    const j = JSON.parse(op) as { speed?: string; bearing?: number };
    if (j.speed) return String(j.speed);
    if (j.bearing != null) return `${j.bearing}°`;
  } catch {
    /* opaque handle */
  }
  return op.length > 12 ? `${op.slice(0, 12)}…` : op;
}
