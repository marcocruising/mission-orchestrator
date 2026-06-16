import { describe, it, expect } from "vitest";
import { fetchEnvironmentForTick } from "@mission-orchestrator/env-import";
import { createServiceClient } from "./client.js";
import { loadEnvironmentContext, upsertEnvironmentSamples } from "./environment.js";
import { kmToM } from "@mission-orchestrator/engine";

const LIVE = process.env.RUN_LIVE_ENV_TESTS === "1";

const OFFSHORE_ENV = {
  geo: { origin_lat: 56.5, origin_lon: 1.0 },
  reference_iso: "2026-06-15T12:00:00Z",
  tick_duration_s: 3600,
  bounds_km: { min: 0, max: 20 },
  grid_step_km: 5,
  depths_m: [0, 60] as const,
};

describe.skipIf(!LIVE)("environment DB round-trip (RUN_LIVE_ENV_TESTS=1)", () => {
  it(
    "imported samples load into EnvironmentContext with correct units",
    async () => {
      const result = await fetchEnvironmentForTick({
        config: OFFSHORE_ENV,
        tick: 0,
        skipCopernicus: !process.env.COPERNICUSMARINE_USERNAME,
      });

      const client = createServiceClient();
      await client.from("environment_samples").delete().eq("ts", 0);
      await upsertEnvironmentSamples(client, result.samples);

      const ctx = await loadEnvironmentContext(client, 0);
      const pos = { x_m: kmToM(10), y_m: kmToM(10), z_m: 0 };

      const hs = ctx.sample("sea_state_hs_m", pos);
      const sal = ctx.sample("salinity_psu", pos);
      const vis = ctx.sample("fog_vis_km", pos);
      const wind = ctx.sample("wind_ms", pos);

      expect(hs).not.toBeNull();
      expect(hs!).toBeGreaterThan(0);
      expect(hs!).toBeLessThan(10);

      expect(vis).not.toBeNull();
      expect(vis!).toBeGreaterThan(0);

      expect(wind).not.toBeNull();
      expect(wind!).toBeGreaterThan(0);
      expect(wind!).toBeLessThan(30);

      if (process.env.COPERNICUSMARINE_USERNAME) {
        expect(sal).not.toBeNull();
        expect(sal!).toBeGreaterThan(30);
        expect(sal!).toBeLessThan(38);
      }
    },
    120_000
  );
});
