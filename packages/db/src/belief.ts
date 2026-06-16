import type { SupabaseClient } from "@supabase/supabase-js";
import type { Belief, Fact } from "@mission-orchestrator/engine";
import { beliefKey } from "@mission-orchestrator/engine";

export async function loadBelief(client: SupabaseClient): Promise<Belief> {
  const { data, error } = await client.from("belief_facts").select("*");
  if (error) throw error;
  const belief: Belief = new Map();
  for (const row of data ?? []) {
    const fact: Fact = {
      asset_id: row.asset_id,
      field: row.field,
      value: row.value,
      ts: Number(row.ts),
      source: row.source,
      confidence: Number(row.confidence),
      half_life_s: Number(row.half_life_s),
    };
    belief.set(beliefKey(fact.asset_id, fact.field), fact);
  }
  return belief;
}

export async function upsertBeliefFacts(client: SupabaseClient, belief: Belief): Promise<void> {
  const rows = [...belief.values()].map((f) => ({
    asset_id: f.asset_id,
    field: f.field,
    value: f.value,
    ts: f.ts,
    source: f.source,
    confidence: f.confidence,
    half_life_s: f.half_life_s,
  }));
  if (rows.length === 0) return;
  const { error } = await client.from("belief_facts").upsert(rows);
  if (error) throw error;
}

export async function loadReportsUpTo(
  client: SupabaseClient,
  maxSentTs: number
): Promise<{ ts: number; asset_id: string; field: string; value: unknown }[]> {
  const { data, error } = await client
    .from("reports")
    .select("ts, asset_id, field, value")
    .lte("ts", maxSentTs)
    .order("ts", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ts: Number(row.ts),
    asset_id: row.asset_id,
    field: row.field,
    value: row.value,
  }));
}

export async function insertReports(
  client: SupabaseClient,
  reports: { ts: number; asset_id: string; field: string; value: unknown }[]
): Promise<void> {
  if (reports.length === 0) return;
  const { error } = await client.from("reports").insert(
    reports.map((r) => ({ ...r, value: r.value as Record<string, unknown> }))
  );
  if (error) throw error;
}

export async function insertWorldTruth(
  client: SupabaseClient,
  rows: object[]
): Promise<void> {
  if (rows.length === 0) return;
  const dbRows = rows.map((row) => {
    const { z_m: _z, ...rest } = row as Record<string, unknown>;
    return rest;
  });
  const { error } = await client.from("world_truth").insert(dbRows);
  if (error) throw error;
}
