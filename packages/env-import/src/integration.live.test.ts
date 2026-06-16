import { describe, it, expect } from "vitest";
import { fetchEnvironmentForTick } from "./fetchEnvironment.js";
import { assertRequiredKinds, validateEnvironmentSamples } from "./validateSamples.js";
import type { ScenarioEnvConfig } from "./types.js";

const OFFSHORE_ENV: ScenarioEnvConfig = {
  geo: { origin_lat: 56.5, origin_lon: 1.0 },
  reference_iso: "2026-06-15T12:00:00Z",
  tick_duration_s: 3600,
  bounds_km: { min: 0, max: 20 },
  grid_step_km: 5,
  depths_m: [0, 60],
};

const LIVE = process.env.RUN_LIVE_ENV_TESTS === "1";

describe.skipIf(!LIVE)("live API integration (RUN_LIVE_ENV_TESTS=1)", () => {
  it(
    "Open-Meteo returns valid sample rows for tick 0",
    async () => {
      const result = await fetchEnvironmentForTick({
        config: OFFSHORE_ENV,
        tick: 0,
        skipCopernicus: true,
      });

      expect(result.samples.length).toBeGreaterThan(50);
      const validation = validateEnvironmentSamples(result.samples);
      expect(validation.issues).toEqual([]);
      expect(validation.ok).toBe(true);

      const missing = assertRequiredKinds(validation.byKind, [
        "sea_state_hs_m",
        "current_u_ms",
        "current_v_ms",
        "wind_ms",
        "wind_direction_deg",
        "fog_vis_km",
      ]);
      expect(missing).toEqual([]);

      const hs = result.samples.find((s) => s.kind === "sea_state_hs_m");
      expect(hs!.value).toBeGreaterThan(0);
      expect(hs!.value).toBeLessThan(10);

      const u = result.samples.find((s) => s.kind === "current_u_ms");
      expect(Math.abs(u!.value)).toBeLessThan(2);
    },
    30_000
  );

  it(
    "Copernicus salinity rows are in valid PSU range",
    async () => {
      if (!process.env.COPERNICUSMARINE_USERNAME) return;

      const result = await fetchEnvironmentForTick({
        config: OFFSHORE_ENV,
        tick: 0,
        skipCopernicus: false,
      });

      const salinity = result.samples.filter((s) => s.kind === "salinity_psu");
      expect(salinity.length).toBeGreaterThan(0);
      const validation = validateEnvironmentSamples(salinity);
      expect(validation.ok).toBe(true);
      for (const row of salinity) {
        expect(row.value).toBeGreaterThan(30);
        expect(row.value).toBeLessThan(38);
        expect([0, 60]).toContain(row.depth_m);
      }
    },
    120_000
  );
});
