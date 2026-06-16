import { fetchCopernicusSalinity } from "./copernicusMarine.js";
import { fetchOpenMeteoMarine } from "./openMeteoMarine.js";
import { fetchOpenMeteoWeather } from "./openMeteoWeather.js";
import { buildSampleGrid, tickToEpochS } from "./sampleGrid.js";
import type { EnvironmentSampleInsert, FetchFn, ScenarioEnvConfig } from "./types.js";

import { assertRequiredKinds, validateEnvironmentSamples } from "./validateSamples.js";

export interface FetchEnvironmentOptions {
  config: ScenarioEnvConfig;
  tick: number;
  fetchFn?: FetchFn;
  /** Skip Copernicus (faster tests / no credentials). */
  skipCopernicus?: boolean;
  pythonBin?: string;
}

export interface FetchEnvironmentResult {
  tick: number;
  targetEpochS: number;
  samples: EnvironmentSampleInsert[];
  sources: { openMeteo: number; copernicus: number };
}

/** Pull env fields from Open-Meteo + Copernicus and map to `environment_samples` rows. */
export async function fetchEnvironmentForTick(
  options: FetchEnvironmentOptions
): Promise<FetchEnvironmentResult> {
  const { config, tick, fetchFn = fetch, skipCopernicus = false, pythonBin } = options;
  const grid = buildSampleGrid(config);
  const targetEpochS = tickToEpochS(config, tick);
  const datetimeIso = new Date(targetEpochS * 1000).toISOString();

  const [marine, weather] = await Promise.all([
    fetchOpenMeteoMarine(grid, targetEpochS, tick, fetchFn),
    fetchOpenMeteoWeather(grid, targetEpochS, tick, fetchFn),
  ]);

  let copernicus: EnvironmentSampleInsert[] = [];
  if (!skipCopernicus) {
    copernicus = await fetchCopernicusSalinity({
      config,
      grid,
      datetimeIso,
      ts: tick,
      pythonBin,
    });
  }

  const samples = [...marine, ...weather, ...copernicus];

  const validation = validateEnvironmentSamples(samples);
  if (!validation.ok) {
    const preview = validation.issues.slice(0, 3).map((i) => i.message).join("; ");
    throw new Error(`Invalid environment samples: ${preview}`);
  }
  const openMeteoRequired = assertRequiredKinds(validation.byKind, [
    "sea_state_hs_m",
    "current_u_ms",
    "current_v_ms",
    "wind_ms",
    "wind_direction_deg",
    "fog_vis_km",
  ]);
  if (openMeteoRequired.length > 0) {
    throw new Error(`Missing Open-Meteo kinds: ${openMeteoRequired.join(", ")}`);
  }
  if (!skipCopernicus) {
    const allRequired = assertRequiredKinds(validation.byKind);
    if (allRequired.length > 0) {
      throw new Error(`Missing required kinds: ${allRequired.join(", ")}`);
    }
  }

  return {
    tick,
    targetEpochS,
    samples,
    sources: {
      openMeteo: marine.length + weather.length,
      copernicus: copernicus.length,
    },
  };
}

export async function fetchEnvironmentForTicks(
  config: ScenarioEnvConfig,
  ticks: number[],
  options?: Omit<FetchEnvironmentOptions, "config" | "tick">
): Promise<FetchEnvironmentResult[]> {
  const results: FetchEnvironmentResult[] = [];
  for (const tick of ticks) {
    results.push(await fetchEnvironmentForTick({ ...options, config, tick }));
  }
  return results;
}

export * from "./types.js";
export * from "./geo.js";
export * from "./sampleGrid.js";
export * from "./openMeteoMarine.js";
export * from "./openMeteoWeather.js";
export * from "./validateSamples.js";
