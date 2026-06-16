import { FIELD_KINDS, type FieldKind } from "@mission-orchestrator/engine";
import type { EnvironmentSampleInsert } from "./types.js";

export interface SampleValidationIssue {
  index: number;
  kind: FieldKind;
  message: string;
}

export interface SampleValidationResult {
  ok: boolean;
  issues: SampleValidationIssue[];
  byKind: Partial<Record<FieldKind, number>>;
}

const kindSet = new Set<string>(FIELD_KINDS);

function range(kind: FieldKind, value: number): string | null {
  switch (kind) {
    case "sea_state_hs_m":
      if (value <= 0 || value > 15) return `sea_state_hs_m out of range: ${value}`;
      return null;
    case "salinity_psu":
      if (value < 20 || value > 42) return `salinity_psu out of range: ${value}`;
      return null;
    case "fog_vis_km":
      if (value <= 0 || value > 50) return `fog_vis_km out of range: ${value}`;
      return null;
    case "wind_ms":
      if (value < 0 || value > 60) return `wind_ms out of range: ${value}`;
      return null;
    case "wind_direction_deg":
      if (value < 0 || value > 360) return `wind_direction_deg out of range: ${value}`;
      return null;
    case "current_u_ms":
    case "current_v_ms":
      if (Math.abs(value) > 5) return `${kind} out of range: ${value}`;
      return null;
    default:
      return null;
  }
}

/** Validate imported rows match engine FieldKind contract and plausible physical ranges. */
export function validateEnvironmentSamples(samples: EnvironmentSampleInsert[]): SampleValidationResult {
  const issues: SampleValidationIssue[] = [];
  const byKind: Partial<Record<FieldKind, number>> = {};

  for (let i = 0; i < samples.length; i++) {
    const row = samples[i]!;
    if (!kindSet.has(row.kind)) {
      issues.push({ index: i, kind: row.kind, message: `unknown kind: ${row.kind}` });
      continue;
    }
    byKind[row.kind] = (byKind[row.kind] ?? 0) + 1;

    if (row.x_km < -1 || row.x_km > 21 || row.y_km < -1 || row.y_km > 21) {
      issues.push({ index: i, kind: row.kind, message: `grid position out of bounds: (${row.x_km}, ${row.y_km})` });
    }
    if (row.depth_m < 0 || row.depth_m > 400) {
      issues.push({ index: i, kind: row.kind, message: `depth_m out of bounds: ${row.depth_m}` });
    }
    if (!Number.isFinite(row.value)) {
      issues.push({ index: i, kind: row.kind, message: "value is not finite" });
      continue;
    }
    const rangeIssue = range(row.kind, row.value);
    if (rangeIssue) issues.push({ index: i, kind: row.kind, message: rangeIssue });
  }

  return { ok: issues.length === 0, issues, byKind };
}

/** Require at least one row per kind needed for D1 factor demo. */
export function assertRequiredKinds(
  byKind: Partial<Record<FieldKind, number>>,
  required: FieldKind[] = [
    "sea_state_hs_m",
    "current_u_ms",
    "current_v_ms",
    "wind_ms",
    "wind_direction_deg",
    "fog_vis_km",
    "salinity_psu",
  ]
): string[] {
  return required.filter((k) => (byKind[k] ?? 0) === 0).map((k) => `missing kind: ${k}`);
}
