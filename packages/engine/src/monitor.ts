import type { Belief } from "./types.js";
import { getFact } from "./types.js";
import { freshness } from "./freshness.js";

export interface Disruption {
  id: string;
  mission_id: string;
  asset_id: string;
  kind: "freshness_floor" | "battery_reserve" | "health_change" | "comms_loss";
  detail: string;
}

export interface MonitorConfig {
  freshnessFloor: number;
  batteryReservePct: number;
}

const DEFAULT_MONITOR: MonitorConfig = {
  freshnessFloor: 0.2,
  batteryReservePct: 15,
};

/** Scan belief for disruptions — no scripted inject required. */
export function scanBelief(
  belief: Belief,
  now: number,
  config: MonitorConfig = DEFAULT_MONITOR
): Disruption[] {
  const disruptions: Disruption[] = [];
  const seen = new Set<string>();

  for (const fact of belief.values()) {
    if (seen.has(fact.asset_id)) continue;

    const fresh = freshness(now - fact.ts, fact.half_life_s) * fact.confidence;
    if (fresh < config.freshnessFloor) {
      disruptions.push({
        id: `dis-${fact.asset_id}-fresh-${now}`,
        mission_id: "",
        asset_id: fact.asset_id,
        kind: "freshness_floor",
        detail: `Belief freshness ${fresh.toFixed(2)} below floor`,
      });
    }

    const batteryFact = getFact(belief, fact.asset_id, "battery_pct");
    if (batteryFact && typeof batteryFact.value === "number" && batteryFact.value < config.batteryReservePct) {
      disruptions.push({
        id: `dis-${fact.asset_id}-bat-${now}`,
        mission_id: "",
        asset_id: fact.asset_id,
        kind: "battery_reserve",
        detail: `Battery ${batteryFact.value}% below reserve`,
      });
    }

    const healthFact = getFact(belief, fact.asset_id, "health");
    if (healthFact && healthFact.value !== "ok") {
      disruptions.push({
        id: `dis-${fact.asset_id}-health-${now}`,
        mission_id: "",
        asset_id: fact.asset_id,
        kind: "health_change",
        detail: `Health degraded: ${healthFact.value}`,
      });
    }

    const comms = getFact(belief, fact.asset_id, "comms_up");
    if (comms && comms.value === false) {
      disruptions.push({
        id: `dis-${fact.asset_id}-comms-${now}`,
        mission_id: "",
        asset_id: fact.asset_id,
        kind: "comms_loss",
        detail: "Comms down",
      });
    }

    seen.add(fact.asset_id);
  }

  return disruptions;
}

export function attachMissionToDisruptions(
  disruptions: Disruption[],
  assetMissionMap: Map<string, string>
): Disruption[] {
  return disruptions.map((d) => ({
    ...d,
    mission_id: assetMissionMap.get(d.asset_id) ?? d.mission_id,
  }));
}

export function shouldAlert(salience: number, sigma: number): boolean {
  return salience >= sigma;
}
