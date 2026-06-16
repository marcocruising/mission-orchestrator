import { describe, it, expect } from "vitest";
import { fetchOpenMeteoMarine } from "./openMeteoMarine.js";
import { fetchOpenMeteoWeather } from "./openMeteoWeather.js";

const point = [{ x_km: 10, y_km: 10, lat: 56.59, lon: 1.14 }];
const targetEpochS = Math.floor(Date.parse("2026-06-15T12:00:00Z") / 1000);

const marineFixture = {
  latitude: 56.59,
  longitude: 1.14,
  hourly: {
    time: ["2026-06-15T11:00", "2026-06-15T12:00"],
    wave_height: [2.0, 2.5],
    ocean_current_velocity: [1.0, 1.2],
    ocean_current_direction: [90, 90],
  },
};

const weatherFixture = {
  latitude: 56.59,
  longitude: 1.14,
  hourly: {
    time: ["2026-06-15T11:00", "2026-06-15T12:00"],
    wind_speed_10m: [18.0, 22.0],
    wind_direction_10m: [270, 270],
    visibility: [10000, 15000],
  },
};

describe("Open-Meteo fetchers", () => {
  it("maps marine hourly to environment sample rows", async () => {
    const fetchFn = async () =>
      ({
        ok: true,
        json: async () => marineFixture,
      }) as Response;

    const rows = await fetchOpenMeteoMarine(point, targetEpochS, 4, fetchFn);
    const hs = rows.find((r) => r.kind === "sea_state_hs_m");
    expect(hs?.value).toBe(2.5);
    expect(hs?.ts).toBe(4);
    expect(rows.some((r) => r.kind === "current_u_ms")).toBe(true);
  });

  it("maps weather hourly to wind and visibility rows", async () => {
    const fetchFn = async () =>
      ({
        ok: true,
        json: async () => weatherFixture,
      }) as Response;

    const rows = await fetchOpenMeteoWeather(point, targetEpochS, 4, fetchFn);
    const wind = rows.find((r) => r.kind === "wind_ms");
    expect(wind?.value).toBeCloseTo(22 * (1000 / 3600), 4);
    expect(rows.some((r) => r.kind === "wind_direction_deg")).toBe(true);
    const fog = rows.find((r) => r.kind === "fog_vis_km");
    expect(fog?.value).toBe(15);
  });
});
