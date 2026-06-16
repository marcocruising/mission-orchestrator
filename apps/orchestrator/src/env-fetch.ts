import { fetchEnvironmentForTicks, type FetchEnvironmentResult } from "@mission-orchestrator/env-import";
import { createServiceClient, upsertEnvironmentSamples } from "@mission-orchestrator/db";
import { SCENARIO_ENV_CONFIG } from "./scenarios/offshore-pipeline.js";
import { SCENARIO_MAX_TICK } from "./scenario-run.js";

export interface EnvFetchResult {
  ticks: number[];
  totalRows: number;
  results: FetchEnvironmentResult[];
}

export async function runEnvFetch(options: {
  tick?: number;
  allTicks?: boolean;
  skipCopernicus?: boolean;
}): Promise<EnvFetchResult> {
  const ticks =
    options.allTicks === true
      ? Array.from({ length: SCENARIO_MAX_TICK + 1 }, (_, i) => i)
      : [options.tick ?? 0];

  const results = await fetchEnvironmentForTicks(SCENARIO_ENV_CONFIG, ticks, {
    skipCopernicus: options.skipCopernicus,
  });

  const client = createServiceClient();
  let totalRows = 0;
  for (const r of results) {
    totalRows += await upsertEnvironmentSamples(client, r.samples);
  }

  return { ticks, totalRows, results };
}
