import { kmToLatLon } from "./geo.js";
import type { GridPoint, ScenarioEnvConfig } from "./types.js";

/** Regular grid over the scenario operating area. */
export function buildSampleGrid(config: ScenarioEnvConfig): GridPoint[] {
  const { geo, bounds_km, grid_step_km } = config;
  const points: GridPoint[] = [];
  for (let x = bounds_km.min; x <= bounds_km.max; x += grid_step_km) {
    for (let y = bounds_km.min; y <= bounds_km.max; y += grid_step_km) {
      const { lat, lon } = kmToLatLon(geo, x, y);
      points.push({ x_km: x, y_km: y, lat, lon });
    }
  }
  return points;
}

/** Unix epoch seconds for a scenario tick (env API datetime). */
export function tickToEpochS(config: ScenarioEnvConfig, tick: number): number {
  const refMs = Date.parse(config.reference_iso);
  if (Number.isNaN(refMs)) throw new Error(`Invalid reference_iso: ${config.reference_iso}`);
  return Math.floor(refMs / 1000) + tick * config.tick_duration_s;
}

export function tickToDate(config: ScenarioEnvConfig, tick: number): Date {
  return new Date(tickToEpochS(config, tick) * 1000);
}
