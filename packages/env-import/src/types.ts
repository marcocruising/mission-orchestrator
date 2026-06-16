import type { FieldKind } from "@mission-orchestrator/engine";

/** Row shape for `environment_samples` — lat/lon converted to km at import boundary. */
export interface EnvironmentSampleInsert {
  ts: number;
  kind: FieldKind;
  x_km: number;
  y_km: number;
  depth_m: number;
  value: number;
}

export interface ScenarioGeo {
  /** SW corner of the scenario (0, 0) km grid. */
  origin_lat: number;
  origin_lon: number;
}

export interface ScenarioEnvConfig {
  geo: ScenarioGeo;
  /** ISO-8601 UTC anchor for tick 0 (Open-Meteo / Copernicus datetime). */
  reference_iso: string;
  /** Seconds between scenario ticks for env time alignment. */
  tick_duration_s: number;
  bounds_km: { min: number; max: number };
  grid_step_km: number;
  depths_m: readonly number[];
}

export interface GridPoint {
  x_km: number;
  y_km: number;
  lat: number;
  lon: number;
}

export type FetchFn = typeof fetch;
