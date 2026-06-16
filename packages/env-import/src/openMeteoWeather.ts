import type { EnvironmentSampleInsert, FetchFn, GridPoint } from "./types.js";
import { chunk, kmhToMs, nearestHourlyIndex } from "./util.js";

const WEATHER_BASE = "https://api.open-meteo.com/v1/forecast";
const CHUNK_SIZE = 20;

interface WeatherHourly {
  time: string[];
  wind_speed_10m?: (number | null)[];
  wind_direction_10m?: (number | null)[];
  visibility?: (number | null)[];
}

interface WeatherLocationResponse {
  latitude: number;
  longitude: number;
  hourly: WeatherHourly;
}

type WeatherResponse = WeatherLocationResponse | WeatherLocationResponse[];

function normalizeWeatherResponse(data: WeatherResponse): WeatherLocationResponse[] {
  return Array.isArray(data) ? data : [data];
}

function num(v: number | null | undefined): number | null {
  return v == null || Number.isNaN(v) ? null : v;
}

export async function fetchOpenMeteoWeather(
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
      hourly: "wind_speed_10m,wind_direction_10m,visibility",
      forecast_days: "2",
      timezone: "UTC",
    });
    const res = await fetchFn(`${WEATHER_BASE}?${params}`);
    if (!res.ok) throw new Error(`Open-Meteo Weather ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as WeatherResponse;
    const locations = normalizeWeatherResponse(data);

    for (let i = 0; i < batch.length; i++) {
      const pt = batch[i]!;
      const loc = locations[i];
      if (!loc?.hourly?.time?.length) continue;

      const idx = nearestHourlyIndex(loc.hourly.time, targetEpochS);
      const windKmh = num(loc.hourly.wind_speed_10m?.[idx]);
      if (windKmh != null) {
        samples.push({
          ts,
          kind: "wind_ms",
          x_km: pt.x_km,
          y_km: pt.y_km,
          depth_m: 0,
          value: kmhToMs(windKmh),
        });
      }

      const windDir = num(loc.hourly.wind_direction_10m?.[idx]);
      if (windDir != null) {
        samples.push({
          ts,
          kind: "wind_direction_deg",
          x_km: pt.x_km,
          y_km: pt.y_km,
          depth_m: 0,
          value: windDir,
        });
      }

      const visM = num(loc.hourly.visibility?.[idx]);
      if (visM != null) {
        samples.push({
          ts,
          kind: "fog_vis_km",
          x_km: pt.x_km,
          y_km: pt.y_km,
          depth_m: 0,
          value: visM / 1000,
        });
      }
    }
  }

  return samples;
}
