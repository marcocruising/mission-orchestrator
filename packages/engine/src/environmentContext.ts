import type { Position3 } from "./spatial.js";
import { depthMToZM, kmToM, slantRangeM } from "./spatial.js";

export type FieldKind =
  | "salinity_psu"
  | "sea_state_hs_m"
  | "wind_ms"
  | "wind_direction_deg"
  | "current_u_ms"
  | "current_v_ms"
  | "fog_vis_km";

export const FIELD_KINDS: FieldKind[] = [
  "salinity_psu",
  "sea_state_hs_m",
  "wind_ms",
  "wind_direction_deg",
  "current_u_ms",
  "current_v_ms",
  "fog_vis_km",
];

export interface EnvironmentSample {
  ts: number;
  x_m: number;
  y_m: number;
  z_m: number;
  kind: FieldKind;
  value: number;
}

export interface EnvironmentContext {
  ts: number;
  sample(kind: FieldKind, pos: Position3): number | null;
}

export type EnvironmentDefaults = Partial<Record<FieldKind, number>>;

/** v1 body — returns configured defaults when no imported data exists. */
export function staticEnvironmentContext(
  ts: number,
  defaults: EnvironmentDefaults = {}
): EnvironmentContext {
  return {
    ts,
    sample(kind: FieldKind, _pos: Position3): number | null {
      return defaults[kind] ?? null;
    },
  };
}

/** Nearest-neighbor lookup over discrete samples (import stub body). */
export function sampleEnvironmentContext(
  ts: number,
  samples: EnvironmentSample[]
): EnvironmentContext {
  return {
    ts,
    sample(kind: FieldKind, pos: Position3): number | null {
      const candidates = samples.filter((s) => s.kind === kind);
      if (candidates.length === 0) return null;
      let best: EnvironmentSample | undefined;
      let bestDist = Infinity;
      for (const s of candidates) {
        const d = slantRangeM(pos, { x_m: s.x_m, y_m: s.y_m, z_m: s.z_m });
        if (d < bestDist) {
          bestDist = d;
          best = s;
        }
      }
      return best?.value ?? null;
    },
  };
}

/** DB row → engine sample (x_km / depth_m converted at load boundary). */
export interface EnvironmentSampleRow {
  ts: number;
  kind: FieldKind;
  x_km: number;
  y_km: number;
  depth_m: number;
  value: number;
}

export function rowToEnvironmentSample(row: EnvironmentSampleRow): EnvironmentSample {
  return {
    ts: row.ts,
    kind: row.kind,
    x_m: kmToM(row.x_km),
    y_m: kmToM(row.y_km),
    z_m: depthMToZM(row.depth_m),
    value: row.value,
  };
}

export function buildEnvironmentContext(
  ts: number,
  rows: EnvironmentSampleRow[],
  defaults: EnvironmentDefaults = {}
): EnvironmentContext {
  const samples = rows.map(rowToEnvironmentSample);
  const grid = sampleEnvironmentContext(ts, samples);
  const fallback = staticEnvironmentContext(ts, defaults);
  return {
    ts,
    sample(kind: FieldKind, pos: Position3): number | null {
      return grid.sample(kind, pos) ?? fallback.sample(kind, pos);
    },
  };
}
