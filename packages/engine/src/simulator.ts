import type { Asset } from "./types.js";

export interface WorldTruthRow {
  tick: number;
  asset_id: string;
  x_km: number;
  y_km: number;
  depth_m: number;
  /** Air assets: altitude in meters (z-up). Emitted as belief fact `z_m`. */
  z_m?: number;
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

export class Simulator {
  private readonly dropped: Set<string>;

  constructor(private readonly options: SimulatorOptions) {
    this.dropped = options.droppedAssets ?? new Set();
  }

  truthAt(tick: number): WorldTruthRow[] {
    const overrides = this.options.timeline.get(tick) ?? new Map();
    return this.options.assets.map((asset) => {
      const o = overrides.get(asset.id) ?? {};
      const depth_m =
        o.depth_m ?? (asset.domain === "subsurface" ? 60 : asset.domain === "surface" ? 0 : 0);
      const z_m = o.z_m ?? (asset.domain === "air" ? 400 : undefined);
      return {
        tick,
        asset_id: asset.id,
        x_km: o.x_km ?? 0,
        y_km: o.y_km ?? 0,
        depth_m,
        z_m,
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
    const assetById = new Map(this.options.assets.map((a) => [a.id, a]));
    const reports: import("./ingest.js").Report[] = [];
    for (const row of rows) {
      if (this.dropped.has(row.asset_id)) continue;
      if (!row.comms_up) {
        reports.push({
          ts: row.tick,
          asset_id: row.asset_id,
          field: "comms_up",
          value: false,
        });
        continue;
      }
      const asset = assetById.get(row.asset_id);
      const commonFields = [
        "x_km",
        "y_km",
        "speed_kn",
        "heading_deg",
        "battery_pct",
        "health",
        "comms_up",
        "gps_ok",
      ] as const;
      for (const field of commonFields) {
        reports.push({
          ts: row.tick,
          asset_id: row.asset_id,
          field,
          value: row[field],
        });
      }
      if (asset?.domain === "air") {
        reports.push({
          ts: row.tick,
          asset_id: row.asset_id,
          field: "z_m",
          value: row.z_m ?? 400,
        });
      } else {
        reports.push({
          ts: row.tick,
          asset_id: row.asset_id,
          field: "depth_m",
          value: row.depth_m,
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
