import type { SupabaseClient } from "@supabase/supabase-js";
import type { VolumeVisitRecord, Footprint, AreaTaskParams } from "@mission-orchestrator/engine";
import { kmToM } from "@mission-orchestrator/engine";

export interface TaskVolumeRow {
  task_id: string;
  cell_id: string;
  last_visit_ts: number;
  peak_quality: number;
}

/** Parse footprint jsonb from tasks — horizontal center in km at DB boundary. */
export function parseFootprintJson(raw: unknown): Footprint | null {
  if (!raw || typeof raw !== "object") return null;
  const fp = raw as Record<string, unknown>;
  if (fp.kind === "aabb") {
    const center = fp.center as Record<string, unknown> | undefined;
    const halfExtent = fp.half_extent_km as Record<string, unknown> | undefined;
    const cx = Number(fp.center_x_km ?? center?.x_km);
    const cy = Number(fp.center_y_km ?? center?.y_km);
    const hw = Number(fp.half_width_km ?? halfExtent?.x);
    const hh = Number(fp.half_height_km ?? halfExtent?.y);
    if ([cx, cy, hw, hh].some((n) => Number.isNaN(n))) return null;
    return {
      kind: "aabb",
      center: { x_m: kmToM(cx), y_m: kmToM(cy) },
      half_extent_m: { x: kmToM(hw), y: kmToM(hh) },
    };
  }
  return null;
}

export function parseAreaTaskParams(row: {
  footprint: unknown;
  z_min_m: number | null;
  z_max_m: number | null;
  revisit_interval_s: number | null;
  cell_size_m: number | null;
  target_x: number;
  target_y: number;
}): AreaTaskParams | undefined {
  let footprint = parseFootprintJson(row.footprint);
  if (!footprint && row.z_min_m != null && row.z_max_m != null) {
    footprint = {
      kind: "aabb",
      center: { x_m: kmToM(Number(row.target_x)), y_m: kmToM(Number(row.target_y)) },
      half_extent_m: { x: 500, y: 500 },
    };
  }
  if (!footprint || row.z_min_m == null || row.z_max_m == null) return undefined;
  return {
    footprint,
    z_min_m: Number(row.z_min_m),
    z_max_m: Number(row.z_max_m),
    revisit_interval_s: Number(row.revisit_interval_s ?? 600),
    cell_size_m: Number(row.cell_size_m ?? 500),
  };
}

export async function loadVolumeVisits(
  client: SupabaseClient
): Promise<Map<string, VolumeVisitRecord[]>> {
  const { data, error } = await client.from("task_volume_visits").select("*");
  if (error) throw error;
  const map = new Map<string, VolumeVisitRecord[]>();
  for (const row of data ?? []) {
    const taskId = row.task_id as string;
    const record: VolumeVisitRecord = {
      cell_id: row.cell_id,
      last_visit_ts: Number(row.last_visit_ts),
      peak_quality: Number(row.peak_quality),
    };
    if (!map.has(taskId)) map.set(taskId, []);
    map.get(taskId)!.push(record);
  }
  return map;
}

export async function upsertVolumeVisits(
  client: SupabaseClient,
  volumeVisits: Map<string, VolumeVisitRecord[]>
): Promise<void> {
  const rows: TaskVolumeRow[] = [];
  for (const [task_id, visits] of volumeVisits) {
    for (const v of visits) {
      rows.push({
        task_id,
        cell_id: v.cell_id,
        last_visit_ts: v.last_visit_ts,
        peak_quality: v.peak_quality,
      });
    }
  }
  if (rows.length === 0) return;
  const { error } = await client.from("task_volume_visits").upsert(rows);
  if (error) throw error;
}
