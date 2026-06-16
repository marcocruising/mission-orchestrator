import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildRoutePlanner,
  type NoGoZone,
  type RoutePlanner,
  type ThreatZone,
} from "@mission-orchestrator/engine";

export async function loadThreats(client: SupabaseClient): Promise<ThreatZone[]> {
  const { data, error } = await client.from("threats").select("*");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    x_km: Number(r.x_km),
    y_km: Number(r.y_km),
    radius_km: Number(r.radius_km),
    intensity: Number(r.intensity),
    z_min_m: r.z_min_m != null ? Number(r.z_min_m) : undefined,
    z_max_m: r.z_max_m != null ? Number(r.z_max_m) : undefined,
  }));
}

export async function loadNoGoZones(client: SupabaseClient): Promise<NoGoZone[]> {
  const { data, error } = await client.from("no_go_zones").select("*");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    x_km: Number(r.x_km),
    y_km: Number(r.y_km),
    radius_km: Number(r.radius_km),
    z_min_m: r.z_min_m != null ? Number(r.z_min_m) : undefined,
    z_max_m: r.z_max_m != null ? Number(r.z_max_m) : undefined,
  }));
}

export async function loadRoutePlanner(client: SupabaseClient): Promise<RoutePlanner> {
  const [threats, noGos] = await Promise.all([loadThreats(client), loadNoGoZones(client)]);
  return buildRoutePlanner(threats, noGos);
}

export type { ThreatZone, NoGoZone, RoutePlanner };
