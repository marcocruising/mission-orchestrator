import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Asset,
  AssetSensor,
  Belief,
  MissionDef,
  Assignment,
  EngineInput,
  EngineConfig,
} from "@mission-orchestrator/engine";
import { buildEngineInput } from "@mission-orchestrator/engine";
import { loadBelief } from "./belief.js";
import { loadEnvironmentContext } from "./environment.js";
import { loadCommsModel } from "./comms.js";
import { loadVolumeVisits, parseAreaTaskParams } from "./volume.js";

export async function loadAssets(client: SupabaseClient): Promise<Asset[]> {
  const { data, error } = await client.from("assets").select("*");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    domain: r.domain,
    depth_rating_m: Number(r.depth_rating_m),
    top_speed_kn: Number(r.top_speed_kn),
    gps_dependent: r.gps_dependent,
  }));
}

export async function loadSensors(client: SupabaseClient): Promise<AssetSensor[]> {
  const { data, error } = await client.from("asset_sensors").select("*");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    asset_id: r.asset_id,
    sensor: r.sensor,
    base_quality: Number(r.base_quality),
    max_range_km: Number(r.max_range_km),
    k_motion: Number(r.k_motion),
    beam_half_angle_deg:
      r.beam_half_angle_deg != null ? Number(r.beam_half_angle_deg) : undefined,
  }));
}

export async function loadMissions(client: SupabaseClient): Promise<MissionDef[]> {
  const { data: missions, error: mErr } = await client.from("missions").select("*");
  if (mErr) throw mErr;
  const { data: tasks, error: tErr } = await client.from("tasks").select("*");
  if (tErr) throw tErr;
  const { data: demands, error: dErr } = await client.from("task_demands").select("*");
  if (dErr) throw dErr;
  const { data: constraints, error: cErr } = await client.from("task_constraints").select("*");
  if (cErr) throw cErr;

  return (missions ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    priority: Number(m.priority),
    tasks: (tasks ?? [])
      .filter((t) => t.mission_id === m.id)
      .map((t) => {
        const kind = (t.kind as "POINT" | "AREA" | undefined) ?? "POINT";
        const area =
          kind === "AREA"
            ? parseAreaTaskParams({
                footprint: t.footprint,
                z_min_m: t.z_min_m,
                z_max_m: t.z_max_m,
                revisit_interval_s: t.revisit_interval_s,
                cell_size_m: t.cell_size_m,
                target_x: Number(t.target_x),
                target_y: Number(t.target_y),
              })
            : undefined;
        return {
          id: t.id,
          mission_id: t.mission_id,
          w_t: Number(t.w_t),
          kind,
          target_x: Number(t.target_x),
          target_y: Number(t.target_y),
          target_depth_m: Number(t.target_depth_m),
          window_end_s: t.window_end_s != null ? Number(t.window_end_s) : null,
          demands: (demands ?? [])
            .filter((d) => d.task_id === t.id)
            .map((d) => ({ sensor: d.sensor, min_quality: Number(d.min_quality) })),
          constraints: (constraints ?? [])
            .filter((c) => c.task_id === t.id)
            .map((c) => ({ kind: c.kind, param: c.param as Record<string, unknown> })),
          area,
        };
      }),
  }));
}

export async function loadAssignments(client: SupabaseClient): Promise<Assignment[]> {
  const { data, error } = await client.from("assignments").select("*");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    asset_id: r.asset_id,
    task_id: r.task_id,
    operating_point: r.operating_point,
    issued_ts: Number(r.issued_ts),
  }));
}

export async function loadConfig(client: SupabaseClient): Promise<EngineConfig> {
  const { data, error } = await client.from("config").select("*");
  if (error) throw error;
  const map = new Map((data ?? []).map((r) => [r.key, Number(r.value)]));
  return {
    p: map.get("p") ?? 0.5,
    tier_full: map.get("tier_full") ?? 0.85,
    tier_degraded: map.get("tier_degraded") ?? 0.6,
    tier_at_risk: map.get("tier_at_risk") ?? 0.3,
    H: map.get("H") ?? 120,
    T_ref: map.get("T_ref") ?? 600,
    sigma: map.get("sigma") ?? 0.4,
    lambda_move: map.get("lambda_move") ?? 0.05,
    lambda_exp: map.get("lambda_exp") ?? 0.3,
    lambda_risk: map.get("lambda_risk") ?? 0.2,
    comms_budget: map.get("comms_budget") ?? 1_000_000,
  };
}

export async function loadCovBaselines(client: SupabaseClient): Promise<Map<string, number>> {
  const { data, error } = await client
    .from("mission_state")
    .select("mission_id, cov_baseline, tick")
    .order("tick", { ascending: false });
  if (error) throw error;
  const map = new Map<string, number>();
  for (const row of data ?? []) {
    if (!map.has(row.mission_id)) map.set(row.mission_id, Number(row.cov_baseline));
  }
  return map;
}

export async function buildEngineInputFromDb(
  client: SupabaseClient,
  now: number
): Promise<EngineInput> {
  const [belief, assets, sensors, missions, assignments, config, covBaselines, environmentContext, commsModel, volumeVisits] =
    await Promise.all([
      loadBelief(client),
      loadAssets(client),
      loadSensors(client),
      loadMissions(client),
      loadAssignments(client),
      loadConfig(client),
      loadCovBaselines(client),
      loadEnvironmentContext(client, now),
      loadCommsModel(client, now),
      loadVolumeVisits(client),
    ]);

  return buildEngineInput({
    belief,
    assets,
    sensors,
    missions,
    assignments,
    config,
    now,
    covBaselines,
    environmentContext,
    commsModel,
    volumeVisits,
  });
}

export type { Belief };
