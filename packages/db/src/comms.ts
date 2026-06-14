import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCommsModel,
  staticCommsModel,
  type CommsLinkRow,
  type CommsModel,
} from "@mission-orchestrator/engine";

export async function loadCommsLinks(
  client: SupabaseClient,
  ts: number
): Promise<CommsLinkRow[]> {
  const { data, error } = await client
    .from("comms_links")
    .select("*")
    .lte("ts", ts)
    .order("ts", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    from_id: row.from_id,
    to_id: row.to_id,
    bandwidth_bps: Number(row.bandwidth_bps),
    delay_s: Number(row.delay_s),
    ts: Number(row.ts),
  }));
}

/** Load comms graph for engine tick — graph body when links exist, static stub otherwise. */
export async function loadCommsModel(
  client: SupabaseClient,
  ts: number
): Promise<CommsModel> {
  try {
    const links = await loadCommsLinks(client, ts);
    if (links.length === 0) return staticCommsModel;
    return buildCommsModel(links);
  } catch {
    return staticCommsModel;
  }
}
