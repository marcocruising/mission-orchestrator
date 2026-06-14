import { createClient } from "@supabase/supabase-js";
import { ownAssetSearchRegion, ownAssetSearchUncertainty, searchEllipseSemiMajor, zMFromBeliefFields } from "@mission-orchestrator/engine";

const url = import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.SUPABASE_URL ?? "";
const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.SUPABASE_ANON_KEY ?? "";

export const supabase = url && key ? createClient(url, key) : null;

export interface AssetRow {
  id: string;
  top_speed_kn: number;
}

export interface BeliefFact {
  asset_id: string;
  field: string;
  value: unknown;
  ts: number;
}

export interface MissionStateRow {
  mission_id: string;
  tick: number;
  cov_baseline: number;
  cov_now: number;
  tier: string;
  confidence: number;
  salience: number;
}

export interface PlanEvalRow {
  plan_id: string;
  objective: number;
  cov_by_mission: Record<string, number>;
  cascades: { mission_id: string; delta: number }[];
  assumptions: string[];
}

export { ownAssetSearchRegion, ownAssetSearchUncertainty, searchEllipseSemiMajor, zMFromBeliefFields };

export function tierColor(tier: string): string {
  switch (tier) {
    case "FULL":
      return "#22c55e";
    case "DEGRADED":
      return "#eab308";
    case "AT_RISK":
      return "#f97316";
    default:
      return "#ef4444";
  }
}
