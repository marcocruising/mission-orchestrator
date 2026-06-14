import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildEnvironmentContext,
  staticEnvironmentContext,
  type EnvironmentContext,
  type EnvironmentSampleRow,
  type FieldKind,
  FIELD_KINDS,
} from "@mission-orchestrator/engine";

function isFieldKind(kind: string): kind is FieldKind {
  return (FIELD_KINDS as readonly string[]).includes(kind);
}

export async function loadEnvironmentSamples(
  client: SupabaseClient,
  ts: number
): Promise<EnvironmentSampleRow[]> {
  const { data, error } = await client
    .from("environment_samples")
    .select("*")
    .lte("ts", ts)
    .order("ts", { ascending: false });
  if (error) throw error;
  const rows: EnvironmentSampleRow[] = [];
  for (const row of data ?? []) {
    if (!isFieldKind(row.kind)) continue;
    rows.push({
      ts: Number(row.ts),
      kind: row.kind,
      x_km: Number(row.x_km),
      y_km: Number(row.y_km),
      depth_m: Number(row.depth_m),
      value: Number(row.value),
    });
  }
  return rows;
}

/** Load environment context for engine tick — nearest-neighbor over samples + static defaults. */
export async function loadEnvironmentContext(
  client: SupabaseClient,
  ts: number,
  defaults?: Partial<Record<FieldKind, number>>
): Promise<EnvironmentContext> {
  try {
    const rows = await loadEnvironmentSamples(client, ts);
    if (rows.length === 0) return staticEnvironmentContext(ts, defaults);
    return buildEnvironmentContext(ts, rows, defaults);
  } catch {
    return staticEnvironmentContext(ts, defaults);
  }
}
