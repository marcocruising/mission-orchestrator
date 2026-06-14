/** Flat local km grid position (lat/lon converted once at ingest). */
export interface Position {
  x_km: number;
  y_km: number;
  depth_m: number;
}

export type AssetKind = "UAV" | "USV" | "UUV";
export type Domain = "air" | "surface" | "subsurface";

export interface Asset {
  id: string;
  kind: AssetKind;
  domain: Domain;
  depth_rating_m: number;
  top_speed_kn: number;
  gps_dependent: boolean;
}

/** Sensor axis identifier — extensible registry; engine uses string keys. */
export type Sensor = string;

export interface AssetSensor {
  asset_id: string;
  sensor: Sensor;
  base_quality: number;
  max_range_km: number;
  k_motion: number;
  /** Half-power beamwidth in degrees — omit for omnidirectional (C2). */
  beam_half_angle_deg?: number;
}

export type FactSource = "telemetry" | "sensor" | "estimate" | "operator";

/** A single belief fact about an asset field. */
export interface Fact {
  asset_id: string;
  field: string;
  value: unknown;
  ts: number;
  source: FactSource;
  confidence: number;
  half_life_s: number;
}

/** Belief state: keyed (asset_id, field) → Fact. */
export type Belief = Map<string, Fact>;

export function beliefKey(assetId: string, field: string): string {
  return `${assetId}:${field}`;
}

export function getFact(belief: Belief, assetId: string, field: string): Fact | undefined {
  return belief.get(beliefKey(assetId, field));
}

export function setFact(belief: Belief, fact: Fact): void {
  belief.set(beliefKey(fact.asset_id, fact.field), fact);
}
