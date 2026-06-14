import type { Asset } from "./types.js";

export interface WorldTruthRow {
  tick: number;
  asset_id: string;
  x_km: number;
  y_km: number;
  depth_m: number;
  speed_kn: number;
  heading_deg: number;
  battery_pct: number;
  health: string;
  comms_up: boolean;
  gps_ok: boolean;
}

export interface SimulatorOptions {
  assets: Asset[];
  /** Per-asset scripted positions keyed by tick */
  timeline: Map<number, Map<string, Partial<Omit<WorldTruthRow, "tick" | "asset_id">>>>;
  /** Assets whose reports are dropped (comms failure simulation) */
  droppedAssets?: Set<string>;
}

const TRUTH_FIELDS = [
  "x_km",
  "y_km",
  "depth_m",
  "speed_kn",
  "heading_deg",
  "battery_pct",
  "health",
  "comms_up",
  "gps_ok",
] as const;

export class Simulator {
  private readonly dropped: Set<string>;

  constructor(private readonly options: SimulatorOptions) {
    this.dropped = options.droppedAssets ?? new Set();
  }

  truthAt(tick: number): WorldTruthRow[] {
    const overrides = this.options.timeline.get(tick) ?? new Map();
    return this.options.assets.map((asset) => {
      const o = overrides.get(asset.id) ?? {};
      return {
        tick,
        asset_id: asset.id,
        x_km: o.x_km ?? 0,
        y_km: o.y_km ?? 0,
        depth_m: o.depth_m ?? 0,
        speed_kn: o.speed_kn ?? asset.top_speed_kn * 0.5,
        heading_deg: o.heading_deg ?? 0,
        battery_pct: o.battery_pct ?? 100,
        health: o.health ?? "ok",
        comms_up: o.comms_up ?? true,
        gps_ok: o.gps_ok ?? true,
      };
    });
  }

  reportsFromTruth(rows: WorldTruthRow[]): import("./ingest.js").Report[] {
    const reports: import("./ingest.js").Report[] = [];
    for (const row of rows) {
      if (this.dropped.has(row.asset_id) || !row.comms_up) continue;
      for (const field of TRUTH_FIELDS) {
        reports.push({
          ts: row.tick,
          asset_id: row.asset_id,
          field,
          value: row[field],
        });
      }
    }
    return reports;
  }

  tick(tick: number): { truth: WorldTruthRow[]; reports: import("./ingest.js").Report[] } {
    const truth = this.truthAt(tick);
    return { truth, reports: this.reportsFromTruth(truth) };
  }
}
