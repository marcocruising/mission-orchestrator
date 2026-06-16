import type { EnvironmentSampleInsert, FetchFn, GridPoint } from "./types.js";
import { chunk, currentToUV, nearestHourlyIndex } from "./util.js";

const MARINE_BASE = "https://marine-api.open-meteo.com/v1/marine";
const CHUNK_SIZE = 20;

interface MarineHourly {
  time: string[];
  wave_height?: (number | null)[];
  ocean_current_velocity?: (number | null)[];
  ocean_current_direction?: (number | null)[];
}

interface MarineLocationResponse {
  latitude: number;
  longitude: number;
  hourly: MarineHourly;
}

type MarineResponse = MarineLocationResponse | MarineLocationResponse[];

function normalizeMarineResponse(data: MarineResponse): MarineLocationResponse[] {
  return Array.isArray(data) ? data : [data];
}

function num(v: number | null | undefined): number | null {
  return v == null || Number.isNaN(v) ? null : v;
}

export async function fetchOpenMeteoMarine(
  points: GridPoint[],
  targetEpochS: number,
  ts: number,
  fetchFn: FetchFn = fetch
): Promise<EnvironmentSampleInsert[]> {
  const samples: EnvironmentSampleInsert[] = [];

  for (const batch of chunk(points, CHUNK_SIZE)) {
    const params = new URLSearchParams({
      latitude: batch.map((p) => p.lat.toFixed(4)).join(","),
      longitude: batch.map((p) => p.lon.toFixed(4)).join(","),
      hourly: "wave_height,ocean_current_velocity,ocean_current_direction",
      forecast_days: "2",
      timezone: "UTC",
    });
    const res = await fetchFn(`${MARINE_BASE}?${params}`);
    if (!res.ok) throw new Error(`Open-Meteo Marine ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as MarineResponse;
    const locations = normalizeMarineResponse(data);

    for (let i = 0; i < batch.length; i++) {
      const pt = batch[i]!;
      const loc = locations[i];
      if (!loc?.hourly?.time?.length) continue;

      const idx = nearestHourlyIndex(loc.hourly.time, targetEpochS);
      const hs = num(loc.hourly.wave_height?.[idx]);
      if (hs != null) {
        samples.push({
          ts,
          kind: "sea_state_hs_m",
          x_km: pt.x_km,
          y_km: pt.y_km,
          depth_m: 0,
          value: hs,
        });
      }

      const vel = num(loc.hourly.ocean_current_velocity?.[idx]);
      const dir = num(loc.hourly.ocean_current_direction?.[idx]);
      if (vel != null && dir != null) {
        const { u_ms, v_ms } = currentToUV(vel, dir);
        samples.push(
          {
            ts,
            kind: "current_u_ms",
            x_km: pt.x_km,
            y_km: pt.y_km,
            depth_m: 0,
            value: u_ms,
          },
          {
            ts,
            kind: "current_v_ms",
            x_km: pt.x_km,
            y_km: pt.y_km,
            depth_m: 0,
            value: v_ms,
          }
        );
      }
    }
  }

  return samples;
}
