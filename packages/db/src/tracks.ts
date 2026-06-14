import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertValidEstimate,
  migrateEstimate,
  rowToTrack,
  trackToRow,
  type Track,
  type TrackRow,
} from "@mission-orchestrator/engine";

/** Parse a DB row — migrates legacy estimate JSON to cv6. */
export function parseTrackRow(row: TrackRow): Track {
  return rowToTrack({
    ...row,
    estimate: migrateEstimate(row.estimate),
  });
}

export async function loadTracks(client: SupabaseClient): Promise<Track[]> {
  const { data, error } = await client.from("tracks").select("*");
  if (error) throw error;
  return (data ?? []).map((row) => parseTrackRow(row as TrackRow));
}

export async function upsertTrack(client: SupabaseClient, track: Track): Promise<void> {
  assertValidEstimate(track.estimate);
  const row = trackToRow(track);
  const { error } = await client.from("tracks").upsert(row);
  if (error) throw error;
}

export async function deleteTrack(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from("tracks").delete().eq("id", id);
  if (error) throw error;
}
